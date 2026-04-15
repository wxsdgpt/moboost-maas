/**
 * urlScraper — zero-dependency HTML meta extractor.
 *
 * Phase 2.1 first pass: we only care about the cheap structured
 * metadata a SSR-rendered marketing site already exposes for SEO:
 *   - <title>
 *   - <meta name="description">
 *   - <meta name="keywords">
 *   - <meta property="og:*">
 *   - <meta name="twitter:*">
 *   - <link rel="icon" / "apple-touch-icon">
 *   - JSON-LD structured data
 *   - A naive body-text fallback (<body> stripped of tags) capped
 *     at ~16k chars for the LLM extractor downstream.
 *
 * What it explicitly does NOT do yet (see TODOs):
 *   - @mozilla/readability main-content extraction
 *   - Playwright / chromium for SPA sites
 *   - App Store / Play Store special cases
 *
 * The public shape is stable so the LLM enrichment step downstream
 * doesn't have to change when we swap the implementation later.
 */

export type RawScrapeResult = {
  url: string                      // canonical / resolved URL
  status: number                   // HTTP status
  fetchedAt: string                // ISO timestamp
  contentHash: string              // sha256 of the raw HTML
  title: string | null
  description: string | null
  keywords: string | null
  lang: string | null
  canonical: string | null
  favicon: string | null
  og: Record<string, string>       // og:title, og:description, og:image, ...
  twitter: Record<string, string>  // twitter:title, twitter:description, ...
  jsonLd: unknown[]                // parsed <script type="application/ld+json"> blobs
  bodyText: string                 // stripped body text, truncated
  htmlBytes: number                // size of raw HTML
  error?: string                   // set if partial failure
}

const MAX_HTML_BYTES = 2_000_000   // 2 MB ceiling on raw fetch
const MAX_BODY_TEXT = 16_000       // cap passed downstream to LLM
const FETCH_TIMEOUT_MS = 12_000
const USER_AGENT =
  'Mozilla/5.0 (compatible; MoboostBot/0.1; +https://moboost.ai/bot)'

/** Rejects App Store / Play Store URLs with a friendly-error marker. */
const APP_STORE_HOST_RE = /^(apps\.apple\.com|play\.google\.com)$/i

export class AppStoreUrlError extends Error {
  constructor(public host: string) {
    super(
      `App Store / Play Store URLs are not supported yet (host: ${host}). ` +
        `Please paste your product's website URL instead.`,
    )
    this.name = 'AppStoreUrlError'
  }
}

export async function scrapeUrl(rawUrl: string): Promise<RawScrapeResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (APP_STORE_HOST_RE.test(parsed.hostname)) {
    // TODO(phase 2.2): replace with iTunes Search API / google-play-scraper
    // branch so we still produce a RawScrapeResult for these inputs.
    throw new AppStoreUrlError(parsed.hostname)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
  } catch (err) {
    clearTimeout(timer)
    throw new Error(`fetch_failed: ${(err as Error).message}`)
  }
  clearTimeout(timer)

  const finalUrl = res.url || parsed.toString()

  // Size guard — read as text with an explicit byte cap.  We don't
  // have streaming semantics readily available in the Next.js edge/node
  // runtimes without extra machinery, so for phase 1 we just pull the
  // whole response and length-check.
  const html = await res.text()
  if (html.length > MAX_HTML_BYTES) {
    throw new Error(`payload_too_large: ${html.length} > ${MAX_HTML_BYTES}`)
  }

  const contentHash = await sha256Hex(html)

  const title = pickTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const description = pickMetaContent(html, [
    { attr: 'name', value: 'description' },
  ])
  const keywords = pickMetaContent(html, [
    { attr: 'name', value: 'keywords' },
  ])
  const canonical = pickLinkHref(html, 'canonical')
  const favicon =
    pickLinkHref(html, 'icon') ??
    pickLinkHref(html, 'shortcut icon') ??
    pickLinkHref(html, 'apple-touch-icon')
  const lang = pickHtmlLang(html)

  const og = pickAllMeta(html, 'property', /^og:/i)
  const twitter = pickAllMeta(html, 'name', /^twitter:/i)
  const jsonLd = extractJsonLd(html)

  const bodyText = extractBodyText(html).slice(0, MAX_BODY_TEXT)

  return {
    url: finalUrl,
    status: res.status,
    fetchedAt: new Date().toISOString(),
    contentHash,
    title: clean(title),
    description: clean(description),
    keywords: clean(keywords),
    lang,
    canonical: clean(canonical),
    favicon: absolutize(finalUrl, favicon),
    og,
    twitter,
    jsonLd,
    bodyText,
    htmlBytes: html.length,
  }
}

// ───────────────────────────────────────────────────────── helpers

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  // Web Crypto is available in both node 18+ runtimes and edge runtimes.
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function clean(v: string | null | undefined): string | null {
  if (!v) return null
  const s = decodeHtmlEntities(v).replace(/\s+/g, ' ').trim()
  return s.length ? s : null
}

function pickTag(html: string, re: RegExp): string | null {
  const m = html.match(re)
  return m ? m[1] : null
}

function pickMetaContent(
  html: string,
  matchers: { attr: 'name' | 'property'; value: string }[],
): string | null {
  for (const { attr, value } of matchers) {
    const re = new RegExp(
      `<meta[^>]*\\b${attr}\\s*=\\s*["']${escapeRe(value)}["'][^>]*>`,
      'i',
    )
    const tag = html.match(re)?.[0]
    if (!tag) continue
    const content = tag.match(/\bcontent\s*=\s*["']([\s\S]*?)["']/i)?.[1]
    if (content) return content
  }
  return null
}

function pickAllMeta(
  html: string,
  attr: 'name' | 'property',
  keyFilter: RegExp,
): Record<string, string> {
  const out: Record<string, string> = {}
  const re = new RegExp(`<meta\\b[^>]*>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const key = tag.match(
      new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i'),
    )?.[1]
    if (!key || !keyFilter.test(key)) continue
    const content = tag.match(/\bcontent\s*=\s*["']([\s\S]*?)["']/i)?.[1]
    if (content) out[key.toLowerCase()] = decodeHtmlEntities(content).trim()
  }
  return out
}

function pickLinkHref(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]*\\brel\\s*=\\s*["']${escapeRe(rel)}["'][^>]*>`,
    'i',
  )
  const tag = html.match(re)?.[0]
  if (!tag) return null
  return tag.match(/\bhref\s*=\s*["']([\s\S]*?)["']/i)?.[1] ?? null
}

function pickHtmlLang(html: string): string | null {
  return (
    html.match(/<html[^>]*\blang\s*=\s*["']([a-zA-Z-]+)["']/i)?.[1] ?? null
  )
}

function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = []
  const re =
    /<script[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim()
    if (!raw) continue
    try {
      out.push(JSON.parse(raw))
    } catch {
      // Some sites wrap multiple objects in CDATA or concatenate with ;
      // — skip malformed blobs rather than blowing up the whole scrape.
    }
  }
  return out
}

function extractBodyText(html: string): string {
  // Drop scripts / styles / svg / noscript / templates first so we
  // don't pollute the text buffer.
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
  const bodyMatch = stripped.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const body = bodyMatch ? bodyMatch[1] : stripped
  // Strip all remaining tags and decode entities.
  const text = decodeHtmlEntities(body.replace(/<[^>]+>/g, ' '))
  return text.replace(/\s+/g, ' ').trim()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function absolutize(base: string, href: string | null): string | null {
  if (!href) return null
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

/**
 * Minimal HTML entity decoder — handles the named entities you
 * actually encounter in title / meta / og text, plus numeric &
 * hex refs.  Not a spec-compliant parser; good enough here.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n))
      } catch {
        return ''
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16))
      } catch {
        return ''
      }
    })
}
