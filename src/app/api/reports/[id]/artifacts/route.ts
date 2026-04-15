/**
 * GET /api/reports/[id]/artifacts
 *
 * Returns every downstream artifact tied to a single report — the landing
 * pages and image/video creatives produced by `/api/brief/execute` and
 * the brief-execute client flow. Drives the "Landing Pages" and
 * "Creatives" tabs on the report-detail page.
 *
 * Reverse-chronological order: a user can re-execute a brief multiple
 * times (different audiences, retries, prompt edits), and the spec is to
 * surface ALL of them with the most recent first rather than dedup.
 *
 * Auth: must own the report. Sub-queries filter on report_id only — the
 * ownership gate is the report fetch.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: reportId } = await params

  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const db = supabaseService()

  // Ownership gate.
  const { data: report, error: reportErr } = await db
    .from('reports')
    .select('id, project_id, product_id')
    .eq('id', reportId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (reportErr || !report) {
    return NextResponse.json({ ok: false, error: 'report_not_found' }, { status: 404 })
  }

  const [landingRes, assetRes] = await Promise.all([
    db.from('landing_pages')
      // `html` is included so the preview modal can render inline without
      // a per-row round-trip.
      .select('id, template_id, status, model, html, filled_slots, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false }),
    db.from('project_assets')
      .select('id, type, prompt, url, thumbnail, model, audience_tag, region, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false }),
  ])

  if (landingRes.error) {
    return NextResponse.json({ ok: false, error: 'db_error', detail: landingRes.error.message }, { status: 500 })
  }
  if (assetRes.error) {
    return NextResponse.json({ ok: false, error: 'db_error', detail: assetRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    projectId: report.project_id,
    productId: report.product_id,
    landingPages: landingRes.data ?? [],
    creatives: assetRes.data ?? [],
  })
}
