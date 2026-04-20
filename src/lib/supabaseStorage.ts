/**
 * Supabase Storage helper.
 *
 * Two responsibilities:
 *
 * 1) `uploadBytes(...)` — write raw bytes to a bucket and return the
 *    public URL. Used by the collaborator upload endpoint and by
 *    ensureStableUrl below.
 *
 * 2) `ensureStableUrl(assetId)` — lazily migrate a project_assets row
 *    whose `url` is either a `data:` URI or an upstream OpenRouter URL
 *    (which can disappear) into our own Supabase Storage bucket and
 *    rewrite the row to point at the stable URL. Idempotent: if the
 *    asset already lives in our bucket, returns the existing URL.
 *
 * The bucket is `creatives` (must exist + be public). Layout:
 *
 *     creatives/
 *       assets/<assetId>.<ext>
 *       localizations/<assetId>/<locale>-<uuid>.<ext>
 *       landings/<landingId>/<locale>-<uuid>.html
 */

import crypto from 'node:crypto'
import { supabaseService } from './db'

export const CREATIVES_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'creatives'

/* ─── helpers ─────────────────────────────────────────────────────────── */

function extFromContentType(ct: string | null | undefined): string {
  if (!ct) return 'bin'
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'text/html': 'html',
    'application/octet-stream': 'bin',
  }
  return map[ct.toLowerCase().split(';')[0].trim()] || 'bin'
}

function extFromDataUri(uri: string): { ext: string; mime: string; bytes: Buffer } | null {
  const m = uri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  const mime = m[1]
  const bytes = Buffer.from(m[2], 'base64')
  return { ext: extFromContentType(mime), mime, bytes }
}

async function fetchBytes(url: string): Promise<{ bytes: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get('content-type') || 'application/octet-stream'
    return { bytes: buf, mime }
  } catch {
    return null
  }
}

/* ─── upload ──────────────────────────────────────────────────────────── */

export async function uploadBytes(opts: {
  path: string                   // e.g. "localizations/<assetId>/es-MX-abc.png"
  bytes: Buffer | Uint8Array
  contentType: string
  bucket?: string
  upsert?: boolean
}): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  const sb = supabaseService()
  const bucket = opts.bucket || CREATIVES_BUCKET
  const { error } = await sb.storage.from(bucket).upload(opts.path, opts.bytes, {
    contentType: opts.contentType,
    upsert: opts.upsert ?? false,
  })
  if (error) return { ok: false, error: error.message }
  const { data } = sb.storage.from(bucket).getPublicUrl(opts.path)
  return { ok: true, url: data.publicUrl, path: opts.path }
}

/* ─── ensure stable URL ───────────────────────────────────────────────── */

/**
 * Returns a URL that is guaranteed to live in our Supabase Storage bucket.
 * If the asset row's url is a data: URI or an external URL, downloads/decodes
 * the bytes, uploads to `creatives/assets/<assetId>.<ext>`, and rewrites
 * the row. Already-stable URLs are returned as-is.
 */
export async function ensureStableUrl(assetId: string): Promise<string | null> {
  const sb = supabaseService()
  const { data: asset, error } = await sb
    .from('project_assets')
    .select('id, url, type')
    .eq('id', assetId)
    .single()
  if (error || !asset?.url) return null

  const url: string = asset.url
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (sbUrl && url.startsWith(sbUrl)) return url   // already stable

  let payload: { bytes: Buffer; mime: string } | null = null
  if (url.startsWith('data:')) {
    const decoded = extFromDataUri(url)
    if (!decoded) return url
    payload = { bytes: decoded.bytes, mime: decoded.mime }
  } else if (/^https?:\/\//i.test(url)) {
    payload = await fetchBytes(url)
    if (!payload) return url   // upstream gone; keep old reference
  } else {
    return url
  }

  const ext = extFromContentType(payload.mime)
  const path = `assets/${assetId}.${ext}`
  const up = await uploadBytes({
    path,
    bytes: payload.bytes,
    contentType: payload.mime,
    upsert: true,
  })
  if (!up.ok) return url

  await sb.from('project_assets').update({ url: up.url }).eq('id', assetId)
  return up.url
}

/* ─── locale-scoped path helpers ──────────────────────────────────────── */

export function localizationAssetPath(assetId: string, locale: string, ext: string): string {
  const id = crypto.randomUUID().slice(0, 8)
  const safeLocale = locale.replace(/[^a-zA-Z0-9-]/g, '')
  return `localizations/${assetId}/${safeLocale}-${id}.${ext}`
}

export function localizationLandingPath(landingId: string, locale: string): string {
  const id = crypto.randomUUID().slice(0, 8)
  const safeLocale = locale.replace(/[^a-zA-Z0-9-]/g, '')
  return `landings/${landingId}/${safeLocale}-${id}.html`
}
