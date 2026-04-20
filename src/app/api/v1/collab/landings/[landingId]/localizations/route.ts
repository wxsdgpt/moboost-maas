/**
 * POST /api/v1/collab/landings/[landingId]/localizations
 * GET  /api/v1/collab/landings/[landingId]/localizations
 *
 * Same shape as the asset-localization endpoint, but the payload is HTML
 * (the localized landing page body) rather than a media URL.
 *
 * POST body: { locale: string, html: string, metadata?: object }
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { requireCollabToken } from '@/lib/collabAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ landingId: string }> }

export async function GET(req: Request, { params }: Params) {
  const tok = await requireCollabToken(req)
  if (tok instanceof NextResponse) return tok
  const { landingId } = await params

  const db = supabaseService()
  const { data, error } = await db
    .from('asset_localizations')
    .select('id, landing_page_id, locale, html, metadata, submitted_by, created_at')
    .eq('landing_page_id', landingId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, landingId, localizations: data ?? [] })
}

export async function POST(req: Request, { params }: Params) {
  const tok = await requireCollabToken(req)
  if (tok instanceof NextResponse) return tok
  const { landingId } = await params

  const body = await req.json().catch(() => null) as
    | { locale?: string; html?: string; metadata?: Record<string, unknown> }
    | null
  if (!body?.locale || !body.html) {
    return NextResponse.json({ ok: false, error: 'locale_and_html_required' }, { status: 400 })
  }

  const db = supabaseService()
  const { data: landing } = await db
    .from('landing_pages')
    .select('id')
    .eq('id', landingId)
    .maybeSingle()
  if (!landing) return NextResponse.json({ ok: false, error: 'landing_not_found' }, { status: 404 })

  const { data, error } = await db
    .from('asset_localizations')
    .insert({
      landing_page_id: landingId,
      locale: body.locale,
      html: body.html,
      metadata: body.metadata ?? {},
      submitted_by: tok.id,
    })
    .select('id, landing_page_id, locale, html, metadata, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, localization: data })
}
