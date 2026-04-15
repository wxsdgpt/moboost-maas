/**
 * productEnrichment - turns a RawScrapeResult into a structured
 * product picture we can feed into marketing generation downstream.
 *
 * Pipeline:
 *   scrapeUrl(url)                            → RawScrapeResult
 *   └─ structuredFromRaw(raw)                 → ExtractedProfile (deterministic, no LLM)
 *   └─ llmExtractFromRaw(raw, seed)           → ExtractedProfile (LLM-enriched, optional)
 *   └─ mergeProfiles(det, llm)                → ExtractedProfile (final)
 *
 * We ALWAYS run the deterministic pass.  The LLM pass is best-effort:
 * if OPENROUTER_API_KEY is missing or the call fails, we return the
 * deterministic profile with `llmFallback: 'mock'` set so the caller
 * knows the result is thin.  This keeps the pipeline testable end-to-end
 * without external dependencies.
 *
 * Output is written to public.products.enrichment as jsonb and the
 * content_hash is recorded so we can skip re-enriching an unchanged
 * source.
 */
import type { RawScrapeResult } from './urlScraper'
import { callLLM } from '@/lib/callLLM'

export type ExtractedProfile = {
  companyName: string | null
  productName: string | null
  tagline: string | null
  /** 2-4 short bullets - what this product sells and to whom. */
  valueProps: string[]
  /** 1-4 short audience descriptors. */
  targetAudience: string[]
  /** Tone of voice descriptor (e.g. "playful / irreverent / crypto-native"). */
  tone: string | null
  /** Main iGaming / product verticals (e.g. ["Sports Betting", "Live Casino"]). */
  verticals: string[]
  /** Feature keywords the page emphasizes ("live odds", "parlay builder", ...). */
  featuresHighlighted: string[]
  /** Explicit CTAs found on the page. */
  cta: string[]
  /** Languages / geos referenced on the page. */
  locales: string[]
}

export type EnrichmentRecord = {
  source: {
    url: string
    fetchedAt: string
    contentHash: string
    status: number
  }
  raw: {
    title: string | null
    description: string | null
    lang: string | null
    favicon: string | null
    ogImage: string | null
    keywords: string | null
  }
  extracted: ExtractedProfile
  meta: {
    llm: 'opus-4.6' | 'mock' | 'off'
    model?: string
    detExtractor: 'v1'
    generatedAt: string
    warnings: string[]
  }
}

// ───────────────────────────────────────────────────────── main entry

export async function buildEnrichment(
  raw: RawScrapeResult,
): Promise<EnrichmentRecord> {
  const warnings: string[] = []

  // 1. Deterministic extraction - always runs.
  const det = structuredFromRaw(raw)

  // 2. Optional LLM pass.  Failing the LLM call degrades gracefully.
  let final = det
  let llmTag: 'opus-4.6' | 'mock' | 'off' = 'off'
  let model: string | undefined

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const llm = await llmExtractFromRaw(raw, det)
      final = mergeProfiles(det, llm.profile)
      llmTag = 'opus-4.6'
      model = llm.model
    } catch (err) {
      warnings.push(`llm_failed: ${(err as Error).message}`)
      llmTag = 'mock'
    }
  } else {
    warnings.push('no_openrouter_key_mock_mode')
    llmTag = 'mock'
  }

  return {
    source: {
      url: raw.url,
      fetchedAt: raw.fetchedAt,
      contentHash: raw.contentHash,
      status: raw.status,
    },
    raw: {
      title: raw.title,
      description: raw.description,
      lang: raw.lang,
      favicon: raw.favicon,
      ogImage: raw.og['og:image'] ?? null,
      keywords: raw.keywords,
    },
    extracted: final,
    meta: {
      llm: llmTag,
      model,
      detExtractor: 'v1',
      generatedAt: new Date().toISOString(),
      warnings,
    },
  }
}

// ───────────────────────────────────────────────────────── deterministic pass

/**
 * Best-effort profile built from the raw scrape WITHOUT a LLM.
 * Pulls from: title, meta description, og:*, twitter:*, JSON-LD
 * Organization / Product / WebSite schemas, and a crude keyword
 * sweep of the body text.
 *
 * This is intentionally lightweight - the LLM pass is where the
 * real quality lives - but it's enough to render a useful card
 * when the LLM is unavailable.
 */
export function structuredFromRaw(raw: RawScrapeResult): ExtractedProfile {
  const fromJsonLd = pickOrganizationFromJsonLd(raw.jsonLd)

  const companyName =
    fromJsonLd?.name ??
    raw.og['og:site_name'] ??
    hostnameFromUrl(raw.url)

  const productName =
    pickProductFromJsonLd(raw.jsonLd)?.name ??
    raw.og['og:title'] ??
    raw.title ??
    null

  const tagline =
    raw.og['og:description'] ??
    raw.description ??
    raw.twitter['twitter:description'] ??
    null

  const valueProps = guessValueProps(raw)
  const verticals = guessVerticals(raw)
  const cta = guessCTAs(raw)
  const features = guessFeatures(raw)
  const locales = uniqLower([
    ...(raw.lang ? [raw.lang] : []),
    ...Object.values(raw.og).filter((v) => /^[a-z]{2}([-_][a-z]{2})?$/i.test(v)),
  ])

  return {
    companyName: companyName ?? null,
    productName,
    tagline,
    valueProps,
    targetAudience: [],
    tone: null,
    verticals,
    featuresHighlighted: features,
    cta,
    locales,
  }
}

function pickOrganizationFromJsonLd(
  blobs: unknown[],
): { name?: string; description?: string } | null {
  for (const blob of blobs) {
    const found = findByType(blob, ['Organization', 'Corporation', 'LocalBusiness'])
    if (found && typeof found === 'object') {
      const o = found as Record<string, unknown>
      return {
        name: typeof o.name === 'string' ? o.name : undefined,
        description:
          typeof o.description === 'string' ? o.description : undefined,
      }
    }
  }
  return null
}

function pickProductFromJsonLd(blobs: unknown[]): { name?: string } | null {
  for (const blob of blobs) {
    const found = findByType(blob, ['Product', 'SoftwareApplication', 'MobileApplication'])
    if (found && typeof found === 'object') {
      const o = found as Record<string, unknown>
      return { name: typeof o.name === 'string' ? o.name : undefined }
    }
  }
  return null
}

function findByType(node: unknown, types: string[]): unknown {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findByType(item, types)
      if (hit) return hit
    }
    return null
  }
  const o = node as Record<string, unknown>
  const t = o['@type']
  const typeList = Array.isArray(t) ? t : typeof t === 'string' ? [t] : []
  if (typeList.some((x) => types.includes(String(x)))) return o
  if ('@graph' in o) return findByType(o['@graph'], types)
  return null
}

function guessValueProps(raw: RawScrapeResult): string[] {
  const pool = [raw.description, raw.og['og:description'], raw.title]
    .filter((x): x is string => !!x && x.length > 0)
  // Split on bullets, pipes, em-dashes, " - ", " • ", commas within a
  // single marketing line.  Cap at 4 and 90 chars each.
  const out: string[] = []
  for (const line of pool) {
    const parts = line
      .split(/\s*[•\|-–·]\s*|\s-\s|,\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4 && s.length <= 90)
    for (const p of parts) {
      if (!out.includes(p)) out.push(p)
      if (out.length >= 4) return out
    }
  }
  return out.slice(0, 4)
}

const VERTICAL_KEYWORDS: Array<[RegExp, string]> = [
  [/\bsport[s]?\s*(betting|book)\b/i, 'Sports Betting'],
  [/\bcasino\b/i, 'Casino'],
  [/\bslots?\b/i, 'Slots'],
  [/\bpoker\b/i, 'Poker'],
  [/\blottery|lotto\b/i, 'Lottery'],
  [/\besports?\b/i, 'Esports'],
  [/\bfantasy\s+sport[s]?\b/i, 'Fantasy Sports'],
  [/\bbingo\b/i, 'Bingo'],
  [/\blive\s+dealer\b/i, 'Live Dealer'],
  [/\bcrash\s+game[s]?\b/i, 'Crash Games'],
]

function guessVerticals(raw: RawScrapeResult): string[] {
  const hay =
    `${raw.title ?? ''} ${raw.description ?? ''} ${raw.og['og:description'] ?? ''} ${raw.bodyText.slice(0, 4000)}`
  const out = new Set<string>()
  for (const [re, label] of VERTICAL_KEYWORDS) {
    if (re.test(hay)) out.add(label)
  }
  return Array.from(out)
}

function guessFeatures(raw: RawScrapeResult): string[] {
  const patterns: Array<[RegExp, string]> = [
    [/\blive\s+odds\b/i, 'Live odds'],
    [/\bparlay\b/i, 'Parlay builder'],
    [/\bwelcome\s+bonus\b/i, 'Welcome bonus'],
    [/\bdeposit\s+match\b/i, 'Deposit match'],
    [/\bfree\s+spins\b/i, 'Free spins'],
    [/\bcash\s*out\b/i, 'Cash out'],
    [/\bcrypto\b|\bbitcoin\b|\busdt\b/i, 'Crypto payments'],
    [/\bmobile\s+app\b/i, 'Mobile app'],
    [/\b24\/7\s+support\b/i, '24/7 support'],
    [/\binstant\s+withdraw(al)?\b/i, 'Instant withdrawals'],
  ]
  const hay = `${raw.title ?? ''} ${raw.description ?? ''} ${raw.bodyText.slice(0, 4000)}`
  const out: string[] = []
  for (const [re, label] of patterns) {
    if (re.test(hay) && !out.includes(label)) out.push(label)
  }
  return out
}

function guessCTAs(raw: RawScrapeResult): string[] {
  // Pull any short uppercase-ish phrases around the first 4000 chars
  // of body text.  Very cheap; the LLM pass refines.
  const phrases = new Set<string>()
  const patterns = [
    /\b(Sign Up Now|Join Now|Bet Now|Play Now|Register Now|Claim Bonus|Get Started|Download App)\b/gi,
  ]
  const hay = raw.bodyText.slice(0, 4000)
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(hay)) !== null) {
      phrases.add(m[0])
      if (phrases.size >= 5) return Array.from(phrases)
    }
  }
  return Array.from(phrases)
}

function uniqLower(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.toLowerCase())))
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ───────────────────────────────────────────────────────── LLM pass (OpenRouter)

const DEFAULT_ENRICHMENT_MODEL =
  process.env.ENRICHMENT_MODEL || 'anthropic/claude-opus-4-6'

const SYSTEM_PROMPT = `You are a marketing analyst.  Given the raw HTML metadata and body text from a product's landing page, extract a structured product picture.

Return ONLY valid JSON matching this TypeScript type, no prose:

{
  "companyName": string | null,
  "productName": string | null,
  "tagline": string | null,
  "valueProps": string[],        // 2-4 short bullets, <= 90 chars each
  "targetAudience": string[],    // 1-4 audience descriptors
  "tone": string | null,         // one short phrase, e.g. "high-energy / direct / sports-betting native"
  "verticals": string[],         // e.g. ["Sports Betting", "Live Casino"]
  "featuresHighlighted": string[], // feature keywords found on the page
  "cta": string[],               // explicit CTAs found on the page
  "locales": string[]            // languages / geos referenced
}

Constraints:
- Do not invent facts.  If the page doesn't support a value, use null or [].
- Keep every string short and marketing-usable.
- Focus on what the page actually says, not generic industry boilerplate.`

export async function llmExtractFromRaw(
  raw: RawScrapeResult,
  seed: ExtractedProfile,
): Promise<{ profile: ExtractedProfile; model: string }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY_missing')

  const userMessage = JSON.stringify({
    url: raw.url,
    title: raw.title,
    description: raw.description,
    keywords: raw.keywords,
    lang: raw.lang,
    og: raw.og,
    twitter: raw.twitter,
    jsonLd: raw.jsonLd.slice(0, 3), // cap
    bodyText: raw.bodyText.slice(0, 8000),
    deterministicGuess: seed,
  })

  const result = await callLLM({
    model: DEFAULT_ENRICHMENT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    caller: 'productEnrichment',
    action: 'llm_extract',
    temperature: 0.2,
    responseFormat: 'json',
    timeoutMs: 30_000,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(result.content)
  } catch (err) {
    throw new Error(`llm_invalid_json: ${(err as Error).message}`)
  }

  return {
    profile: coerceProfile(parsed),
    model: result.model,
  }
}

function coerceProfile(raw: unknown): ExtractedProfile {
  const o = (raw ?? {}) as Record<string, unknown>
  const asStr = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
  const asStrArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []

  return {
    companyName: asStr(o.companyName),
    productName: asStr(o.productName),
    tagline: asStr(o.tagline),
    valueProps: asStrArr(o.valueProps).slice(0, 6),
    targetAudience: asStrArr(o.targetAudience).slice(0, 6),
    tone: asStr(o.tone),
    verticals: asStrArr(o.verticals).slice(0, 6),
    featuresHighlighted: asStrArr(o.featuresHighlighted).slice(0, 12),
    cta: asStrArr(o.cta).slice(0, 6),
    locales: asStrArr(o.locales).slice(0, 6),
  }
}

// ───────────────────────────────────────────────────────── merge

/**
 * Merge the deterministic and LLM profiles.  LLM wins on every field
 * where it provides a non-empty value, falling back to the deterministic
 * pass otherwise.
 */
export function mergeProfiles(
  det: ExtractedProfile,
  llm: ExtractedProfile,
): ExtractedProfile {
  const pref = <T>(a: T | null | undefined, b: T | null | undefined): T | null =>
    (a ?? null) || (b ?? null) || null
  const prefArr = (a: string[], b: string[]): string[] =>
    a.length > 0 ? a : b

  return {
    companyName: pref(llm.companyName, det.companyName),
    productName: pref(llm.productName, det.productName),
    tagline: pref(llm.tagline, det.tagline),
    valueProps: prefArr(llm.valueProps, det.valueProps),
    targetAudience: prefArr(llm.targetAudience, det.targetAudience),
    tone: pref(llm.tone, det.tone),
    verticals: prefArr(llm.verticals, det.verticals),
    featuresHighlighted: prefArr(
      llm.featuresHighlighted,
      det.featuresHighlighted,
    ),
    cta: prefArr(llm.cta, det.cta),
    locales: prefArr(llm.locales, det.locales),
  }
}
