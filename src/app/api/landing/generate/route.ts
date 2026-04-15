/**
 * POST /api/landing/generate
 *
 * Body: { productId: string, templateId?: 'hero-cta' | 'feature-grid' | 'social-proof', reportId?: string }
 *
 * Generates a landing page for the given product using the specified template.
 * Pipeline:
 *   1. Auth check + product ownership
 *   2. Load product + enrichment data
 *   3. Optionally load report summary for richer context
 *   4. Call landing page generator (template slots → LLM → HTML)
 *   5. Persist result to DB
 *   6. Return generated landing page data
 *
 * GET /api/landing/generate?landingId=xxx
 *   Retrieve a previously generated landing page.
 *
 * GET /api/landing/generate?productId=xxx
 *   List all landing pages for a product.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import { generateLanding } from '@/lib/landingGenerator'
import type { TemplateId } from '@/lib/landingTemplates'
import type { EnrichmentRecord } from '@/lib/productEnrichment'
import { logPipelineStart } from '@/lib/eventLog'
import { resolveProjectId } from '@/lib/projectResolver'

export const runtime = 'nodejs'
export const maxDuration = 60 // landing gen is lighter than reports

const VALID_TEMPLATES: TemplateId[] = ['hero-cta', 'feature-grid', 'social-proof']

export async function POST(req: NextRequest) {
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
  let body: { productId?: unknown; templateId?: unknown; reportId?: unknown; projectId?: unknown }
  try {
    body = (await req.json()) as { productId?: unknown; templateId?: unknown; reportId?: unknown; projectId?: unknown }
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

  const templateId: TemplateId =
    typeof body.templateId === 'string' && VALID_TEMPLATES.includes(body.templateId as TemplateId)
      ? (body.templateId as TemplateId)
      : 'hero-cta'

  const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : null
  const projectIdOverride = typeof body.projectId === 'string' ? body.projectId.trim() : null

  // 3. Load product + verify ownership
  const db = supabaseService()
  const { data: product, error: prodErr } = await db
    .from('products')
    .select('id, name, url, category, enrichment, user_id')
    .eq('id', productId)
    .maybeSingle()

  if (prodErr || !product) {
    return NextResponse.json(
      { ok: false, error: 'product_not_found' },
      { status: 404 },
    )
  }

  if (product.user_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: 'product_not_owned' },
      { status: 403 },
    )
  }

  // 4. Optionally load report summary for richer context
  let reportSummary: string | undefined
  if (reportId) {
    const { data: report } = await db
      .from('reports')
      .select('output')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .eq('status', 'done')
      .maybeSingle()

    if (report?.output) {
      // Extract a brief summary from report sections
      const output = report.output as { sections?: Array<{ title?: string; content?: string }> }
      if (output.sections?.length) {
        reportSummary = output.sections
          .slice(0, 3)
          .map((s) => `${s.title || 'Section'}: ${(s.content || '').slice(0, 200)}`)
          .join('\n\n')
      }
    }
  }

  // 5. Generate landing page
  const endLog = logPipelineStart('landing', user.id, { templateId, productId })
  try {
    const enrichment = product.enrichment as EnrichmentRecord | null

    const result = await generateLanding(templateId, {
      productName: product.name || 'Product',
      productUrl: product.url || '',
      vertical: (product as { category?: string | null }).category || null,
      enrichment,
      reportSummary,
    })

    // 6. Resolve project (auto-create if needed) so artifact never orphans
    const projectId = await resolveProjectId(
      db,
      user.id,
      productId,
      projectIdOverride,
      product.name || 'Product',
      'landing_generation',
    )

    // 7. Persist to DB
    const { data: landingRow, error: insertErr } = await db
      .from('landing_pages')
      .insert({
        user_id: user.id,
        product_id: productId,
        project_id: projectId,
        template_id: templateId,
        report_id: reportId,
        filled_slots: result.filledSlots,
        html: result.html,
        model: result.model,
        status: 'done',
      })
      .select('id')
      .single()

    if (insertErr) {
      // DB insert failed but we have the HTML — return it anyway
      endLog({ templateId, model: result.model, slots: result.filledSlots.length, persisted: false, projectId })
      return NextResponse.json({
        ok: true,
        landingId: null,
        landing: result,
        projectId,
        warning: 'generated_but_not_persisted',
      })
    }

    endLog({ templateId, model: result.model, slots: result.filledSlots.length, landingId: landingRow.id, projectId })
    return NextResponse.json({
      ok: true,
      landingId: landingRow.id,
      landing: result,
      projectId,
    })
  } catch (err) {
    endLog({ error: (err as Error).message }, true)
    return NextResponse.json(
      { ok: false, error: `generation_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}

/**
 * GET /api/landing/generate?landingId=xxx  — single landing page
 * GET /api/landing/generate?productId=xxx  — list for product
 * GET /api/landing/generate                — list all for user
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

  const db = supabaseService()
  const landingId = req.nextUrl.searchParams.get('landingId')
  const productId = req.nextUrl.searchParams.get('productId')

  if (landingId) {
    const { data, error } = await db
      .from('landing_pages')
      .select('id, product_id, template_id, report_id, filled_slots, html, model, status, created_at')
      .eq('id', landingId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'landing_not_found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, landing: data })
  }

  // List landings
  let query = db
    .from('landing_pages')
    .select('id, product_id, template_id, status, model, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (productId) {
    query = query.eq('product_id', productId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, landings: data })
}
