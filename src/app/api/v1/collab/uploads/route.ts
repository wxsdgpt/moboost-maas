/**
 * POST /api/v1/collab/uploads
 *
 * Multipart upload channel for collaborator-supplied bytes (localized
 * images/videos). Stores the file in the `creatives` Supabase Storage
 * bucket and returns the public URL. The caller then POSTs that URL to
 * /api/v1/collab/assets/[assetId]/localizations to register it.
 *
 * Form fields:
 *   file       — required, the binary
 *   assetId    — optional, scopes the path under localizations/<assetId>/
 *   landingId  — optional, scopes the path under landings/<landingId>/
 *   locale     — optional, embedded in the filename for traceability
 *
 * Files are namespaced per asset/landing where possible so listings stay
 * organized; otherwise they land in `localizations/_misc/`.
 */

import { NextResponse } from 'next/server'
import { requireCollabToken } from '@/lib/collabAuth'
import {
  uploadBytes,
  localizationAssetPath,
  localizationLandingPath,
  CREATIVES_BUCKET,
} from '@/lib/supabaseStorage'
import crypto from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

function extFromName(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]{1,6})$/)
  return m ? m[1].toLowerCase() : 'bin'
}

export async function POST(req: Request) {
  const tok = await requireCollabToken(req)
  if (tok instanceof NextResponse) return tok

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'multipart_required' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'file_required' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'file_too_large', maxBytes: MAX_BYTES }, { status: 413 })
  }

  const assetId = (form.get('assetId') as string) || null
  const landingId = (form.get('landingId') as string) || null
  const locale = ((form.get('locale') as string) || 'xx').replace(/[^a-zA-Z0-9-]/g, '')
  const filename = (file as File).name || 'upload'
  const ext = extFromName(filename)
  const contentType = file.type || 'application/octet-stream'
  const bytes = Buffer.from(await file.arrayBuffer())

  let path: string
  if (landingId) {
    path = localizationLandingPath(landingId, locale).replace(/\.html$/, `.${ext}`)
  } else if (assetId) {
    path = localizationAssetPath(assetId, locale, ext)
  } else {
    path = `localizations/_misc/${locale}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  }

  const up = await uploadBytes({ path, bytes, contentType })
  if (!up.ok) {
    return NextResponse.json({ ok: false, error: 'upload_failed', detail: up.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    bucket: CREATIVES_BUCKET,
    path: up.path,
    url: up.url,
    bytes: bytes.length,
    contentType,
  })
}
