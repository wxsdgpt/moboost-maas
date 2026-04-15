/**
 * POST /api/brief/regenerate-landing
 *
 * Regenerate a landing page tied to a report, using a user-supplied prompt
 * to bias the slot-fill output. Persists a NEW landing_pages row alongside
 * any prior ones for the same report — re-runs stack reverse-chronologically
 * in the report-detail "Landing Pages" tab (we never overwrite history).
 *
 * Body: { reportId, customPrompt?, templateId? }
 *
 * Why this exists separately from /api/landing/generate: that route is the
 * canonical first-time-generation entrypoint and takes a productId. Regen
 * starts from a reportId (the user is on the report-detail page) and threads
 * the user's free-form prompt into the generator's context as additional
 * guidance. Ownership is enforced via the report row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import { generateLanding } from '@/lib/landingGenerator'
import type { TemplateId } from '@/lib/landingTemplates'
import type { EnrichmentRecord } from '@/lib/productEnrichment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VALID_TEMPLATES: TemplateId[] = ['hero-cta', 'feature-grid', 'social-proof']

type Body = {
  reportId?: unknown
  customPrompt?: unknown
  templateId?: unknown
}

function s(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })

  const reportId = s(body.reportId)
  if (!reportId) {
    return NextResponse.json({ ok: false, error: 'missing_report_id' }, { status: 400 })
  }
  const customPrompt = s(body.customPrompt)
  const templateOverride = s(body.templateId)

  const db = supabaseService()

  // Ownership gate via report.
  const { data: report, error: reportErr } = await db
    .from('reports')
    .select('id, project_id, product_id, output')
    .eq('id', reportId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (reportErr || !report) {
    return NextResponse.json({ ok: false, error: 'report_not_found' }, { status: 404 })
  }
  if (!report.project_id || !report.product_id) {
    return NextResponse.json({ ok: false, error: 'report_missing_project_or_product' }, { status: 409 })
  }

  // Pull product for landing-gen context.
  const { data: product, error: prodErr } = await db
    .from('products')
    .select('id, name, url, category, enrichment')
    .eq('id', report.product_id)
    .maybeSingle()
  if (prodErr || !product) {
    return NextResponse.json({ ok: false, error: 'product_not_found' }, { status: 404 })
  }

  // Pick the most recent landing for this report to inherit its template
  // unless the caller forced a different one.
  let templateId: TemplateId = 'hero-cta'
  if (templateOverride && (VALID_TEMPLATES as string[]).includes(templateOverride)) {
    templateId = templateOverride as TemplateId
  } else {
    const { data: prev } = await db
      .from('landing_pages')
      .select('template_id')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (prev?.template_id && (VALID_TEMPLATES as string[]).includes(prev.template_id)) {
      templateId = prev.template_id as TemplateId
    }
  }

  // Build the report-summary context. If the user supplied a custom prompt,
  // prepend it so the slot-fill LLM sees it as a primary directive.
  const reportSummary = buildSummary(report.output, customPrompt)

  let result
  try {
    result = await generateLanding(templateId, {
      productName: product.name || 'Product',
      productUrl: product.url || '',
      vertical: (product as { category?: string | null }).category || null,
      enrichment: product.enrichment as EnrichmentRecord | null,
      reportSummary,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'generation_failed', detail: (err as Error).message },
      { status: 502 },
    )
  }

  const { data: row, error: insertErr } = await db
    .from('landing_pages')
    .insert({
      user_id: user.id,
      product_id: report.product_id,
      project_id: report.project_id,
      template_id: templateId,
      report_id: reportId,
      filled_slots: result.filledSlots,
      html: result.html,
      model: result.model,
      status: 'done',
    })
    .select('id, template_id, status, model, html, filled_slots, created_at')
    .single()

  if (insertErr) {
    return NextResponse.json(
      { ok: false, error: 'db_error', detail: insertErr.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, landingPage: row })
}

function buildSummary(output: unknown, customPrompt: string | null): string | undefined {
  const parts: string[] = []
  if (customPrompt) {
    parts.push(`## User Override (highest priority)\n${customPrompt}`)
  }
  if (output && typeof output === 'object') {
    const sections = (output as { sections?: Array<{ title?: string; content?: string }> }).sections
    if (Array.isArray(sections) && sections.length) {
      const summary = sections
        .slice(0, 3)
        .map((sec) => `${sec.title || 'Section'}: ${(sec.content || '').slice(0, 200)}`)
        .join('\n\n')
      parts.push(summary)
    }
  }
  return parts.length ? parts.join('\n\n') : undefined
}
