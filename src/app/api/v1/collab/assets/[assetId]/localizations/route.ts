/**
 * POST /api/v1/collab/assets/[assetId]/localizations
 * GET  /api/v1/collab/assets/[assetId]/localizations
 *
 * Submit-equals-adopt: a POST inserts a new asset_localizations row and
 * the new locale-asset is immediately considered live. No review step.
 *
 * POST body: { locale: string, url: string, metadata?: object }
 *   - `url` should be a Supabase Storage URL produced by /uploads, but
 *     any https URL is accepted and stored as-is.
 *
 * GET returns every localization row for the asset, newest first.
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { requireCollabToken } from '@/lib/collabAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ assetId: string }> }

export async function GET(req: Request, { params }: Params) {
  const tok = await requireCollabToken(req)
  if (tok instanceof NextResponse) return tok
  const { assetId } = await params

  const db = supabaseService()
  const { data, error } = await db
    .from('asset_localizations')
    .select('id, asset_id, locale, url, metadata, submitted_by, created_at')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, assetId, localizations: data ?? [] })
}

export async function POST(req: Request, { params }: Params) {
  const tok = await requireCollabToken(req)
  if (tok instanceof NextResponse) return tok
  const { assetId } = await params

  const body = await req.json().catch(() => null) as
    | { locale?: string; url?: string; metadata?: Record<string, unknown> }
    | null
  if (!body?.locale || !body.url) {
    return NextResponse.json({ ok: false, error: 'locale_and_url_required' }, { status: 400 })
  }

  const db = supabaseService()
  // Confirm asset exists.
  const { data: asset } = await db
    .from('project_assets')
    .select('id')
    .eq('id', assetId)
    .maybeSingle()
  if (!asset) return NextResponse.json({ ok: false, error: 'asset_not_found' }, { status: 404 })

  const { data, error } = await db
    .from('asset_localizations')
    .insert({
      asset_id: assetId,
      locale: body.locale,
      url: body.url,
      metadata: body.metadata ?? {},
      submitted_by: tok.id,
    })
    .select('id, asset_id, locale, url, metadata, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, localization: data })
}
