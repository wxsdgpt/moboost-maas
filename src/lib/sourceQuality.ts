/**
 * Source Quality Scoring — the 5-dimension model xu asked for.
 *
 *   1. authenticity — 真实性：是否来自可信/权威源
 *   2. timeliness   — 及时性：内容新鲜程度（按更新周期 + publishedAt）
 *   3. relevance    — 相关性：与 brief 关键词的文本匹配度
 *   4. quality      — 优质性：长度 / 结构化 / 有无多媒体元素
 *   5. diversity    — 多样性：在结果集维度，不同 host 的覆盖度（单条默认 5）
 *
 * 每个维度 0-10，总分取加权平均。权重可调（默认均等），总分 < 50 视作低质量。
 */
import { lookupTrustedSourceByUrl, type TrustedSource } from './trustedSources'

export interface ScoreWeights {
  authenticity: number
  timeliness: number
  relevance: number
  quality: number
  diversity: number
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  authenticity: 0.3,
  timeliness: 0.2,
  relevance: 0.25,
  quality: 0.15,
  diversity: 0.1,
}

export interface SearchResultCandidate {
  url: string
  title?: string
  snippet?: string
  /** ISO date if available */
  publishedAt?: string
  /** raw content length if already fetched */
  contentLength?: number
  /** does the page have images/video/structured data */
  hasMedia?: boolean
}

export interface ScoredResult extends SearchResultCandidate {
  scores: {
    authenticity: number
    timeliness: number
    relevance: number
    quality: number
    diversity: number
    /** weighted total 0-10 */
    total: number
  }
  trustedSource?: TrustedSource
}

// ─── Authenticity ─────────────────────────────────────────────────────────

function scoreAuthenticity(url: string): { score: number; ts?: TrustedSource } {
  const ts = lookupTrustedSourceByUrl(url)
  if (ts) return { score: ts.trustLevel, ts }
  // Fallback heuristics for unknown hosts:
  try {
    const host = new URL(url).hostname
    if (/\.(gov|edu)(\.|$)/.test(host)) return { score: 9 }
    if (/\.(org)(\.|$)/.test(host)) return { score: 6 }
    if (host.endsWith('.io') || host.endsWith('.ai') || host.endsWith('.com')) return { score: 4 }
    return { score: 3 }
  } catch {
    return { score: 0 }
  }
}

// ─── Timeliness ───────────────────────────────────────────────────────────

function scoreTimeliness(c: SearchResultCandidate, ts?: TrustedSource): number {
  if (c.publishedAt) {
    const d = Date.parse(c.publishedAt)
    if (!Number.isNaN(d)) {
      const ageDays = (Date.now() - d) / 86_400_000
      if (ageDays < 7) return 10
      if (ageDays < 30) return 9
      if (ageDays < 90) return 7
      if (ageDays < 180) return 5
      if (ageDays < 365) return 3
      return 1
    }
  }
  // Without a publish date, fall back to the trusted source's update cadence
  if (ts) {
    if (ts.updateCadenceDays <= 3) return 8
    if (ts.updateCadenceDays <= 14) return 7
    if (ts.updateCadenceDays <= 60) return 5
    return 3
  }
  return 4
}

// ─── Relevance ────────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}

function scoreRelevance(c: SearchResultCandidate, queryTerms: string[]): number {
  if (!queryTerms.length) return 5
  const hayTokens = new Set([
    ...tokenize(c.title || ''),
    ...tokenize(c.snippet || ''),
  ])
  if (hayTokens.size === 0) return 0
  let hits = 0
  for (const q of queryTerms) {
    if (hayTokens.has(q.toLowerCase())) hits++
  }
  const ratio = hits / queryTerms.length
  // Normalize: 100% match → 10, 50% → 6, 0% → 1
  return Math.round(Math.min(10, 1 + ratio * 9))
}

// ─── Quality ──────────────────────────────────────────────────────────────

function scoreQuality(c: SearchResultCandidate): number {
  let s = 5
  if ((c.title?.length ?? 0) > 12) s += 1
  if ((c.snippet?.length ?? 0) > 80) s += 1
  if ((c.contentLength ?? 0) > 2000) s += 1
  if (c.hasMedia) s += 1
  if ((c.contentLength ?? 0) > 10_000) s += 1
  return Math.min(10, s)
}

// ─── Diversity (post-hoc, applied to the whole result set) ────────────────

function applyDiversity(results: ScoredResult[]): ScoredResult[] {
  const seenHosts = new Map<string, number>()
  for (const r of results) {
    let host = ''
    try {
      host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      host = 'unknown'
    }
    const prior = seenHosts.get(host) || 0
    // First hit from a host gets full 10, subsequent hits decay
    const divScore = prior === 0 ? 10 : Math.max(1, 10 - prior * 3)
    r.scores.diversity = divScore
    seenHosts.set(host, prior + 1)
    // Recompute total
    r.scores.total = weightedTotal(r.scores, DEFAULT_WEIGHTS)
  }
  return results
}

function weightedTotal(
  s: ScoredResult['scores'],
  w: ScoreWeights,
): number {
  return Math.round(
    (s.authenticity * w.authenticity +
      s.timeliness * w.timeliness +
      s.relevance * w.relevance +
      s.quality * w.quality +
      s.diversity * w.diversity) *
      10,
  ) / 10
}

// ─── Public entrypoint ───────────────────────────────────────────────────

export function scoreResults(
  candidates: SearchResultCandidate[],
  queryTerms: string[],
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ScoredResult[] {
  const scored: ScoredResult[] = candidates.map((c) => {
    const { score: authScore, ts } = scoreAuthenticity(c.url)
    const timelinessScore = scoreTimeliness(c, ts)
    const relevanceScore = scoreRelevance(c, queryTerms)
    const qualityScore = scoreQuality(c)
    const initial = {
      authenticity: authScore,
      timeliness: timelinessScore,
      relevance: relevanceScore,
      quality: qualityScore,
      diversity: 5, // filled by applyDiversity
      total: 0,
    }
    initial.total = weightedTotal(initial, weights)
    return { ...c, scores: initial, trustedSource: ts }
  })

  const diversified = applyDiversity(scored)
  // Sort by total desc
  diversified.sort((a, b) => b.scores.total - a.scores.total)
  return diversified
}

/** Convert total 0-10 to a 0-100 integer for human-friendly display */
export function toPercent(total: number): number {
  return Math.round(total * 10)
}

/** Returns true if the result passes the quality gate (default 50/100) */
export function passesGate(r: ScoredResult, threshold = 5): boolean {
  return r.scores.total >= threshold
}
