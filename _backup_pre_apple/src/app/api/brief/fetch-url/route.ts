/**
 * POST /api/brief/fetch-url
 *
 * Body: { url: string } or { urls: string[] }
 * Resp: { refs: ParsedReference[], errors: { url, error }[] }
 *
 * Thin wrapper around `lib/briefFetcher.ts` so the brief intake UI can preview
 * extracted references before submitting Stage 2 clarification.
 */
import { NextRequest, NextResponse } from 'next/server'
import { fetchUrlsAsRefs } from '@/lib/briefFetcher'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let payload: { url?: string; urls?: string[] }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const urls: string[] = []
  if (typeof payload.url === 'string') urls.push(payload.url)
  if (Array.isArray(payload.urls)) {
    for (const u of payload.urls) if (typeof u === 'string') urls.push(u)
  }
  if (urls.length === 0) {
    return NextResponse.json({ error: 'no_urls_provided' }, { status: 400 })
  }
  if (urls.length > 20) {
    return NextResponse.json({ error: 'too_many_urls', max: 20 }, { status: 400 })
  }

  const { refs, errors } = await fetchUrlsAsRefs(urls)
  return NextResponse.json({ refs, errors })
}
