/**
 * Shared URL → ParsedReference fetcher used by both
 *   • POST /api/brief/fetch-url   (explicit endpoint)
 *   • POST /api/brief/clarify     (server-side, before LLM call)
 *
 * Extracted into a lib so the two routes don't drift apart.
 */
import type { ParsedReference } from '@/lib/briefTypes'
import { extractFromHtml, decodeBody } from '@/lib/htmlExtract'

const FETCH_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 8 * 1024 * 1024
const USER_AGENT = 'moboost-maas/0.1 (+brief-fetcher)'
const MAX_PARALLEL = 5
const MAX_URLS_PER_BATCH = 20

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

export interface FetchOutcome {
  ok: boolean
  url: string
  ref?: ParsedReference
  error?: string
}

export function isSafeUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_protocol' }
  }
  const host = u.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: 'blocked_host' }
  if (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.endsWith('.local')
  ) {
    return { ok: false, reason: 'private_network' }
  }
  return { ok: true, url: u }
}

export async function fetchUrlAsRef(rawUrl: string): Promise<FetchOutcome> {
  const check = isSafeUrl(rawUrl)
  if (!check.ok) return { ok: false, url: rawUrl, error: check.reason }
  const url = check.url

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) return { ok: false, url: rawUrl, error: `http_${res.status}` }

    const contentType = res.headers.get('content-type') || ''
    if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      return { ok: false, url: rawUrl, error: `unsupported_content_type:${contentType.split(';')[0]}` }
    }

    const lenHeader = res.headers.get('content-length')
    if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
      return { ok: false, url: rawUrl, error: 'body_too_large' }
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BODY_BYTES) {
      return { ok: false, url: rawUrl, error: 'body_too_large' }
    }

    const html = decodeBody(buf, contentType)
    const ex = extractFromHtml(html, url.toString())

    const ref: ParsedReference = {
      url: url.toString(),
      pageType: ex.pageType,
      extractedAssets: {
        heroImage: ex.heroImage,
        banners: ex.images.slice(0, 6),
        videos: ex.videos.slice(0, 4),
        copy: {
          title: ex.title,
          body: ex.description || ex.leadCopy?.slice(0, 400),
        },
      },
    }
    return { ok: true, url: rawUrl, ref }
  } catch (err: unknown) {
    const error = err as Record<string, unknown>
    const msg = error?.name === 'AbortError' ? 'timeout' : (error?.message as string) || 'fetch_error'
    return { ok: false, url: rawUrl, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

async function runPooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= tasks.length) return
      results[i] = await tasks[i]()
    }
  })
  await Promise.all(workers)
  return results
}

export async function fetchUrlsAsRefs(
  rawUrls: string[],
): Promise<{ refs: ParsedReference[]; errors: { url: string; error: string }[] }> {
  if (!rawUrls.length) return { refs: [], errors: [] }
  const trimmed = rawUrls.slice(0, MAX_URLS_PER_BATCH)
  const tasks = trimmed.map((u) => () => fetchUrlAsRef(u))
  const outcomes = await runPooled(tasks, MAX_PARALLEL)
  const refs: ParsedReference[] = []
  const errors: { url: string; error: string }[] = []
  for (const o of outcomes) {
    if (o.ok && o.ref) refs.push(o.ref)
    else errors.push({ url: o.url, error: o.error || 'unknown' })
  }
  return { refs, errors }
}
