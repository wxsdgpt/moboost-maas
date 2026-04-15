/**
 * POST /api/brief/expert-search
 *
 * Stage 2 expert augmentation. xu asked for:
 *   "通过用户提供的已有信息，以专家方式补充内容。寻找可信渠道，按 真实性 /
 *    及时性 / 相关性 / 优质性 / 多样性 打分，沉淀到本地。"
 *
 * Request body:
 *   {
 *     query: string              — free-text query (usually the brief's text)
 *     categories?: SourceCategory[]  — restrict search to these categories
 *     candidates?: SearchResultCandidate[]  — if you already have raw results
 *     refresh?: boolean          — bypass cache
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     meta: { hash, hitCache, categories, resultCount, topScore, cachedAt },
 *     results: ScoredResult[],
 *   }
 *
 * If no external candidates are supplied, the route falls back to the local
 * `TRUSTED_SOURCES` registry, building one candidate per source in the
 * requested categories. This means the endpoint is always useful, even
 * without a search provider wired in.
 *
 * All results are persisted via `expertSearchStore` so identical future
 * queries get an instant cache hit.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  TRUSTED_SOURCES,
  getSourcesByCategory,
  type SourceCategory,
} from '@/lib/trustedSources'
import {
  scoreResults,
  type SearchResultCandidate,
  type ScoredResult,
} from '@/lib/sourceQuality'
import {
  loadCachedResults,
  saveResults,
} from '@/lib/expertSearchStore'

export const runtime = 'nodejs'

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 20)
}

/**
 * Builds candidates from the trusted-source registry when no external
 * search results were provided. Each registry entry becomes a candidate
 * whose title = source.name and snippet = source.description.
 */
function synthesizeFromRegistry(
  categories: SourceCategory[],
): SearchResultCandidate[] {
  const pool = categories.length
    ? categories.flatMap((c) => getSourcesByCategory(c))
    : TRUSTED_SOURCES

  return pool.map((s) => ({
    url: s.url,
    title: s.name,
    snippet: s.description,
    // No publishedAt — scorer will fall back to cadence
    hasMedia: false,
    contentLength: s.description.length * 10, // rough proxy
  }))
}

export async function POST(req: NextRequest) {
  let body: {
    query?: string
    categories?: SourceCategory[]
    candidates?: SearchResultCandidate[]
    refresh?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const query = (body.query || '').trim()
  if (!query) {
    return NextResponse.json({ error: 'query_required' }, { status: 400 })
  }
  if (query.length > 1000) {
    return NextResponse.json({ error: 'query_too_long' }, { status: 400 })
  }

  const categories = Array.isArray(body.categories) ? body.categories : []
  const refresh = body.refresh === true

  // ── Cache lookup ────────────────────────────────────────────────────
  if (!refresh) {
    const cached = await loadCachedResults(query, categories)
    if (cached) {
      return NextResponse.json({
        ok: true,
        meta: {
          hash: cached.meta.hash,
          hitCache: true,
          categories,
          resultCount: cached.meta.resultCount,
          topScore: cached.meta.topScore,
          cachedAt: cached.meta.createdAt,
          hitCount: cached.meta.hitCount,
        },
        results: cached.results,
      })
    }
  }

  // ── Candidate assembly ──────────────────────────────────────────────
  const candidates: SearchResultCandidate[] =
    Array.isArray(body.candidates) && body.candidates.length
      ? body.candidates
      : synthesizeFromRegistry(categories)

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'no_candidates', hint: 'Provide candidates[] or pick categories that exist in TRUSTED_SOURCES' },
      { status: 422 },
    )
  }

  // ── Score ───────────────────────────────────────────────────────────
  const queryTerms = tokenize(query)
  const scored: ScoredResult[] = scoreResults(candidates, queryTerms)

  // ── Persist ─────────────────────────────────────────────────────────
  const meta = await saveResults(query, categories, scored)

  return NextResponse.json({
    ok: true,
    meta: {
      hash: meta.hash,
      hitCache: false,
      categories,
      resultCount: meta.resultCount,
      topScore: meta.topScore,
      cachedAt: meta.createdAt,
      hitCount: meta.hitCount,
    },
    results: scored,
  })
}

export async function GET() {
  return NextResponse.json({
    usage:
      'POST { query, categories?, candidates?, refresh? } — scores and caches expert sources.',
    categories: [
      'ad-specs',
      'marketing-insight',
      'creative-trend',
      'igaming',
      'design-system',
      'copywriting',
      'competitive-intel',
      'regulatory',
      'data-analytics',
      'stock-media',
    ],
  })
}
