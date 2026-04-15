/**
 * Dependency-free HTML extractor.
 *
 * Not a full readability implementation — this is a pragmatic middle ground
 * that gives the brief-flow enough signal to populate `ParsedReference`:
 *
 *   • page title (og:title > <title>)
 *   • meta description (og:description > twitter:description > description)
 *   • hero image (og:image > twitter:image > first big <img>)
 *   • images (all <img src>, resolved to absolute URLs, deduped)
 *   • videos (all <video src> + <source src> under video, plus og:video)
 *   • lead copy (up to 2000 chars of visible text after strip)
 *   • page-type guess (product / landing / article / social / unknown)
 *
 * Intentionally tolerant: failures return partial data rather than throwing.
 */

export interface HtmlExtractResult {
  title?: string
  description?: string
  heroImage?: string
  images: string[]
  videos: string[]
  leadCopy?: string
  pageType: 'product' | 'landing' | 'article' | 'social' | 'unknown'
}

const META_CHARSET_RE = /<meta[^>]+charset\s*=\s*["']?([^"'>\s]+)/i

/** Decode numeric and named HTML entities we care about. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function pickAttr(tag: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = tag.match(re)
  if (!m) return undefined
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim()
}

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}

function findMeta(html: string, key: string, keyAttr: 'property' | 'name'): string | undefined {
  // Match <meta> tags where property="key" or name="key" (order-independent)
  const re = new RegExp(
    `<meta\\b[^>]*\\b${keyAttr}\\s*=\\s*["']${key}["'][^>]*>`,
    'i',
  )
  const m = html.match(re)
  if (!m) return undefined
  return pickAttr(m[0], 'content')
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function guessPageType(
  url: string,
  title: string | undefined,
  html: string,
): HtmlExtractResult['pageType'] {
  const u = url.toLowerCase()
  if (
    /\b(twitter|x|instagram|facebook|linkedin|tiktok|weibo|xiaohongshu|reddit)\./.test(
      u,
    )
  ) {
    return 'social'
  }
  if (/\/(product|p|item|goods|dp)\//.test(u)) return 'product'
  if (/\/(article|blog|post|news|story)\//.test(u)) return 'article'

  const lower = html.toLowerCase()
  if (lower.includes('add to cart') || lower.includes('加入购物车') || lower.includes('buy now')) {
    return 'product'
  }
  if (lower.includes('<article') || lower.includes('published') || lower.includes('byline')) {
    return 'article'
  }
  if (title && /landing|campaign|signup|register|get started/i.test(title)) {
    return 'landing'
  }
  return 'unknown'
}

export function extractFromHtml(html: string, baseUrl: string): HtmlExtractResult {
  // Title: og:title → <title>
  const ogTitle = findMeta(html, 'og:title', 'property')
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const rawTitle = titleTagMatch ? decodeEntities(titleTagMatch[1]).trim() : undefined
  const title = (ogTitle || rawTitle || '').trim() || undefined

  // Description
  const description =
    findMeta(html, 'og:description', 'property') ||
    findMeta(html, 'twitter:description', 'name') ||
    findMeta(html, 'description', 'name')

  // Hero image
  const ogImage =
    findMeta(html, 'og:image', 'property') ||
    findMeta(html, 'twitter:image', 'name')
  const heroImage = ogImage ? absolutize(ogImage, baseUrl) : undefined

  // All images (take at most 32 for sanity)
  const imgTagRe = /<img\b[^>]*>/gi
  const imgs = new Set<string>()
  let imgMatch: RegExpExecArray | null
  while ((imgMatch = imgTagRe.exec(html)) && imgs.size < 32) {
    const src = pickAttr(imgMatch[0], 'src')
    if (src && !src.startsWith('data:')) {
      imgs.add(absolutize(src, baseUrl))
    }
  }
  if (heroImage) imgs.add(heroImage)

  // Videos (og:video + <video>/<source>)
  const videos = new Set<string>()
  const ogVideo =
    findMeta(html, 'og:video', 'property') ||
    findMeta(html, 'og:video:secure_url', 'property')
  if (ogVideo) videos.add(absolutize(ogVideo, baseUrl))

  const videoBlockRe = /<video\b[^>]*>([\s\S]*?)<\/video>/gi
  let vMatch: RegExpExecArray | null
  while ((vMatch = videoBlockRe.exec(html)) && videos.size < 16) {
    const outerSrc = pickAttr(vMatch[0].slice(0, vMatch[0].indexOf('>') + 1), 'src')
    if (outerSrc) videos.add(absolutize(outerSrc, baseUrl))
    const sourceRe = /<source\b[^>]*>/gi
    let sMatch: RegExpExecArray | null
    while ((sMatch = sourceRe.exec(vMatch[1])) && videos.size < 16) {
      const src = pickAttr(sMatch[0], 'src')
      if (src) videos.add(absolutize(src, baseUrl))
    }
  }

  // Lead copy — strip tags and take the first 2000 chars
  const text = stripTags(html)
  const leadCopy = text ? decodeEntities(text).slice(0, 2000) : undefined

  return {
    title,
    description,
    heroImage,
    images: Array.from(imgs),
    videos: Array.from(videos),
    leadCopy,
    pageType: guessPageType(baseUrl, title, html),
  }
}

/** Decode an HTTP response body using the declared charset, falling back to UTF-8. */
export function decodeBody(buf: ArrayBuffer, contentType?: string | null): string {
  let charset = 'utf-8'
  if (contentType) {
    const m = contentType.match(/charset=([^;]+)/i)
    if (m) charset = m[1].trim().toLowerCase()
  }
  // Peek at meta charset in the first 4KB if we don't have one yet
  if (charset === 'utf-8') {
    const peek = new TextDecoder('ascii').decode(buf.slice(0, 4096))
    const m = peek.match(META_CHARSET_RE)
    if (m) charset = m[1].toLowerCase()
  }
  try {
    return new TextDecoder(charset).decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}
