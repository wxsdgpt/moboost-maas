/**
 * POST /api/reports/generate
 *
 * Body: { productId: string, kind?: 'lite' | 'full' | 'competitive-brief' }
 *
 * Generates a marketing analysis report for the given product.
 * Pipeline:
 *   1. Auth check + product ownership
 *   2. Reserve credits (based on report kind)
 *   3. Run report generator (product enrichment + market intel + LLM)
 *   4. Commit credits on success, rollback on failure
 *   5. Return structured report
 *
 * Default kind is 'lite' (3 credits, partial sections).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import { CREDIT_COSTS, reserve, commit, rollback } from '@/lib/creditLedger'
import { generateReport } from '@/lib/reportGenerator'
import type { ReportKind, GenerateReportResponse } from '@/lib/reportTypes'
import { logPipelineStart, logEvent } from '@/lib/eventLog'

export const runtime = 'nodejs'
export const maxDuration = 120 // seconds — report generation can take time

const VALID_KINDS: ReportKind[] = ['lite', 'full', 'competitive-brief']

export async function POST(req: NextRequest): Promise<NextResponse<GenerateReportResponse>> {
  // 1. Auth
  let user
  try {
    user = await getOrCreateCurrentUser()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'auth_failed' },
      { status: 500 },
    )
  }
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'unauthenticated' },
      { status: 401 },
    )
  }

  // 2. Parse body
  let body: { productId?: unknown; kind?: unknown }
  try {
    body = (await req.json()) as { productId?: unknown; kind?: unknown }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    )
  }

  const productId = typeof body.productId === 'string' ? body.productId.trim() : null
  if (!productId) {
    return NextResponse.json(
      { ok: false, error: 'product_id_required' },
      { status: 400 },
    )
  }

  const kind: ReportKind =
    typeof body.kind === 'string' && VALID_KINDS.includes(body.kind as ReportKind)
      ? (body.kind as ReportKind)
      : 'lite'

  // 3. Reserve credits
  const cost = CREDIT_COSTS[kind === 'competitive-brief' ? 'competitive-brief' : kind === 'full' ? 'report-full' : 'report-lite']
  const db = supabaseService()

  let reservationId: string | null = null
  try {
    reservationId = await reserve(db, user.id, cost)
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('insufficient')) {
      return NextResponse.json(
        { ok: false, error: `insufficient_credits: need ${cost}, check your balance` },
        { status: 402 },
      )
    }
    return NextResponse.json(
      { ok: false, error: `credit_reserve: ${msg}` },
      { status: 500 },
    )
  }

  // 4. Generate report
  const endLog = logPipelineStart('report', user.id, { kind, productId, cost })
  try {
    const { reportId, report } = await generateReport(user.id, productId, kind)

    // 5. Commit credits
    if (reservationId) {
      try {
        await commit(db, user.id, reservationId)
      } catch (err) {
        console.error('[reports/generate] commit failed:', err)
        // Report was generated successfully — don't fail the response
      }
    }

    endLog({ reportId, kind, sections: report?.sections?.length })
    logEvent('credit_committed', user.id, { amount: cost, kind })
    return NextResponse.json({ ok: true, reportId, report })
  } catch (err) {
    // Rollback credits on failure
    if (reservationId) {
      try {
        await rollback(db, user.id, reservationId)
      } catch (rollbackErr) {
        console.error('[reports/generate] rollback failed:', rollbackErr)
      }
    }

    // Update report status to failed if row was created
    try {
      await db
        .from('reports')
        .update({
          status: 'failed',
          output: { error: (err as Error).message },
        })
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .eq('status', 'running')
    } catch {
      // Best effort
    }

    endLog({ error: (err as Error).message, kind }, true)
    return NextResponse.json(
      { ok: false, error: `generation_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}

/**
 * GET /api/reports/generate?reportId=xxx
 *
 * Retrieve a previously generated report.
 */
export async function GET(req: NextRequest) {
  let user
  try {
    user = await getOrCreateCurrentUser()
  } catch {
    return NextResponse.json({ ok: false, error: 'auth_failed' }, { status: 500 })
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }

  const reportId = req.nextUrl.searchParams.get('reportId')
  if (!reportId) {
    // Return all reports for user
    const db = supabaseService()
    const { data, error } = await db
      .from('reports')
      .select('id, product_id, kind, status, output, credits_charged, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, reports: data })
  }

  const db = supabaseService()
  const { data, error } = await db
    .from('reports')
    .select('id, product_id, kind, status, output, credits_charged, created_at')
    .eq('id', reportId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: 'report_not_found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, report: data })
}
