/**
 * GET /api/v1/collab/reports/[reportId]/exports?since=ISO
 *
 * Hand collaborators (e.g. localization vendors) every artifact attached
 * to a report so they can pull source material for translation. Optional
 * `since` filter (ISO timestamp) lets callers do incremental polls.
 *
 * Response includes both the original artifacts AND any localizations
 * already submitted, so a caller can see what's already been delivered
 * and avoid duplicate work.
 *
 * NOTE: ownership is intentionally bypassed here — possession of a valid
 * bearer token is the access grant. Tokens should be scoped at issuance
 * time (future: scopes column on collab_tokens).
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { requireCollabToken } from '@/lib/collabAuth'
import { ensureStableUrl } from '@/lib/supabaseStorage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ reportId: string }> }

export async function GET(req: Request, { params }: Params) {
  const tok = await requireCollabToken(req)
  if (tok instanceof NextResponse) return tok

  const { reportId } = await params
  const url = new URL(req.url)
  const since = url.searchParams.get('since')

  const db = supabaseService()
  const { data: report } = await db
    .from('reports')
    .select('id, project_id, product_id')
    .eq('id', reportId)
    .maybeSingle()
  if (!report) {
    return NextResponse.json({ ok: false, error: 'report_not_found' }, { status: 404 })
  }

  let landingsQ = db.from('landing_pages')
    .select('id, template_id, status, model, html, created_at')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
  let assetsQ = db.from('project_assets')
    .select('id, type, prompt, url, thumbnail, model, audience_tag, region, created_at')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
  if (since) {
    landingsQ = landingsQ.gte('created_at', since)
    assetsQ = assetsQ.gte('created_at', since)
  }
  const [landingRes, assetRes] = await Promise.all([landingsQ, assetsQ])

  // Migrate any unstable URLs to Supabase Storage in parallel (best-effort).
  const assets = assetRes.data ?? []
  await Promise.all(
    assets.map(async (a) => {
      const stable = await ensureStableUrl(a.id)
      if (stable) a.url = stable
    }),
  )

  // Fetch existing localizations for these artifacts.
  const assetIds = assets.map(a => a.id)
  const landingIds = (landingRes.data ?? []).map(l => l.id)
  const [locAssetsRes, locLandingsRes] = await Promise.all([
    assetIds.length
      ? db.from('asset_localizations')
          .select('id, asset_id, locale, url, metadata, created_at')
          .in('asset_id', assetIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; asset_id: string; locale: string; url: string | null; metadata: unknown; created_at: string }>, error: null }),
    landingIds.length
      ? db.from('asset_localizations')
          .select('id, landing_page_id, locale, html, metadata, created_at')
          .in('landing_page_id', landingIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; landing_page_id: string; locale: string; html: string | null; metadata: unknown; created_at: string }>, error: null }),
  ])

  return NextResponse.json({
    ok: true,
    reportId,
    projectId: report.project_id,
    productId: report.product_id,
    landingPages: landingRes.data ?? [],
    creatives: assets,
    localizations: {
      assets: locAssetsRes.data ?? [],
      landings: locLandingsRes.data ?? [],
    },
  })
}
