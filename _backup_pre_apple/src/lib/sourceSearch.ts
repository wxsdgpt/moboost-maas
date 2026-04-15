/**
 * Source Search & Ranking — moboost-maas
 *
 * Stage 2/3 的「专家补充」入口：给一个查询意图，从 trustedSources 注册表里
 * 挑出最相关的若干条源，并按 5 个质量维度打分。
 *
 * 五个维度（每条 0..1，归一化后 weighted sum 得出最终得分）：
 *   • truthfulness  权威度  ← trustLevel
 *   • timeliness    时效性  ← lastReviewed 的新鲜度 + updateCadenceDays
 *   • relevance     相关性  ← tag/keyword/category 命中
 *   • quality       质量    ← trustLevel + 是否一手 + 类型
 *   • diversity     多样性  ← 多类别覆盖（在结果集层面计算）
 *
 * 不做实际网络抓取——只负责"挑哪些源最值得查"。真正的抓取由
 * `briefFetcher.ts` 或 LLM 工具调用阶段执行。
 *
 * 设计目标：
 *   - 纯函数、无副作用、可单元测试
 *   - 不依赖任何外部包
 *   - O(n) 扫描 + O(k log k) 排序，n=注册表大小（~40），k=结果上限
 */
import {
  TRUSTED_SOURCES,
  TrustedSource,
  SourceCategory,
  getSourcesByCategory,
} from './trustedSources'

// ─── Types ──────────────────────────────────────────────────────────────

export interface SourceQueryIntent {
  /** 自然语言关键词或短语，可多个 */
  keywords: string[]
  /** 强类别约束（可选）。命中此类别的源加分 */
  preferredCategories?: SourceCategory[]
  /** 强 tag 约束（可选） */
  preferredTags?: string[]
  /** 期望源的语言。'any' = 不限制 */
  language?: 'zh' | 'en' | 'multi' | 'any'
  /** 是否只接受一手源（trustLevel >= 9） */
  firstPartyOnly?: boolean
  /** 结果上限 */
  limit?: number
}

export interface ScoredSource {
  source: TrustedSource
  /** 0..1 normalized total score */
  score: number
  breakdown: {
    truthfulness: number
    timeliness: number
    relevance: number
    quality: number
    diversity: number
  }
  /** 命中此源的关键词 / tag / category，便于 UI 展示「为什么挑了它」 */
  matched: string[]
}

// ─── Weights (sum to 1.0) ───────────────────────────────────────────────

const W = {
  truthfulness: 0.3,
  timeliness: 0.2,
  relevance: 0.3,
  quality: 0.1,
  diversity: 0.1,
} as const

// ─── Component scorers (each returns 0..1) ──────────────────────────────

function scoreTruthfulness(s: TrustedSource): number {
  return Math.min(1, s.trustLevel / 10)
}

function scoreTimeliness(s: TrustedSource): number {
  // Combine: how recent the human review was, plus inverse of update cadence.
  // A daily-updated source reviewed today scores 1.0; a 6-month-old review of a
  // 180-day cadence source scores ~0.4.
  const reviewed = Date.parse(s.lastReviewed)
  if (Number.isNaN(reviewed)) return 0.5
  const ageDays = Math.max(0, (Date.now() - reviewed) / (1000 * 60 * 60 * 24))
  // Decay: half-life ~90 days
  const recencyScore = Math.exp(-ageDays / 90)
  // Cadence: a source updated every day is fresh; every 180 days is stale
  const cadenceScore = Math.max(0, 1 - Math.log10(s.updateCadenceDays + 1) / 2.5)
  return Math.min(1, recencyScore * 0.6 + cadenceScore * 0.4)
}

function scoreQuality(s: TrustedSource): number {
  // Quality blends trustLevel with a small bonus for first-party docs and
  // standards bodies.
  let q = s.trustLevel / 10
  if (s.category === 'ad-specs' || s.category === 'regulatory' || s.category === 'design-system') {
    q = Math.min(1, q + 0.05)
  }
  return q
}

/**
 * Relevance is the only intent-aware scorer. It returns a score in 0..1 plus
 * the list of matched terms so the UI can explain the choice.
 */
function scoreRelevance(
  s: TrustedSource,
  intent: SourceQueryIntent,
): { score: number; matched: string[] } {
  const matched: string[] = []
  let raw = 0

  const haystack = `${s.name} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase()

  // Keyword hits
  for (const kw of intent.keywords) {
    const k = kw.trim().toLowerCase()
    if (!k) continue
    if (haystack.includes(k)) {
      raw += 1
      matched.push(`kw:${k}`)
    }
  }

  // Tag hits (stronger weight)
  if (intent.preferredTags) {
    for (const tag of intent.preferredTags) {
      const t = tag.toLowerCase()
      if ((s.tags || []).map((x) => x.toLowerCase()).includes(t)) {
        raw += 2
        matched.push(`tag:${t}`)
      }
    }
  }

  // Category boost
  if (intent.preferredCategories?.includes(s.category)) {
    raw += 1.5
    matched.push(`cat:${s.category}`)
  }

  // Normalize: 5+ raw points = 1.0
  const score = Math.min(1, raw / 5)
  return { score, matched }
}

// ─── Diversity penalty (applied at the result-set level) ─────────────────

/**
 * After ranking by individual score, walk the list and demote sources that
 * share a category with one already accepted. This produces a more diverse
 * result set without throwing away highly-relevant matches entirely.
 */
function applyDiversity(scored: ScoredSource[]): ScoredSource[] {
  const seen = new Map<SourceCategory, number>()
  return scored.map((entry) => {
    const c = entry.source.category
    const count = seen.get(c) || 0
    // First in a category: 1.0; second: 0.85; third: 0.7; …
    const factor = Math.max(0.5, 1 - count * 0.15)
    seen.set(c, count + 1)
    const newBreakdown = { ...entry.breakdown, diversity: factor }
    const newScore =
      newBreakdown.truthfulness * W.truthfulness +
      newBreakdown.timeliness * W.timeliness +
      newBreakdown.relevance * W.relevance +
      newBreakdown.quality * W.quality +
      newBreakdown.diversity * W.diversity
    return { ...entry, score: newScore, breakdown: newBreakdown }
  })
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Search the trusted source registry and return the top-K sources for a query
 * intent, ranked by weighted score with diversity adjustment.
 */
export function searchSources(intent: SourceQueryIntent): ScoredSource[] {
  const limit = intent.limit ?? 8
  const langOk = (s: TrustedSource) => {
    if (!intent.language || intent.language === 'any') return true
    if (intent.language === 'multi') return s.language === 'multi'
    return s.language === intent.language || s.language === 'multi'
  }
  const firstPartyOk = (s: TrustedSource) =>
    !intent.firstPartyOnly || s.trustLevel >= 9

  // Score every source. Drop anything with relevance == 0 unless the user
  // explicitly asked for a category (in which case we still surface that
  // category's top entries).
  const askedForCategory = (intent.preferredCategories?.length ?? 0) > 0

  let scored: ScoredSource[] = TRUSTED_SOURCES.filter(langOk)
    .filter(firstPartyOk)
    .map((s) => {
      const t = scoreTruthfulness(s)
      const tm = scoreTimeliness(s)
      const r = scoreRelevance(s, intent)
      const q = scoreQuality(s)
      const breakdown = {
        truthfulness: t,
        timeliness: tm,
        relevance: r.score,
        quality: q,
        diversity: 1, // filled in by applyDiversity
      }
      const total =
        t * W.truthfulness +
        tm * W.timeliness +
        r.score * W.relevance +
        q * W.quality +
        1 * W.diversity
      return { source: s, score: total, breakdown, matched: r.matched }
    })
    .filter((entry) => entry.breakdown.relevance > 0 || askedForCategory)

  // Sort and take 2x limit so diversity has room to shuffle
  scored.sort((a, b) => b.score - a.score)
  scored = scored.slice(0, limit * 2)

  // Apply diversity
  scored = applyDiversity(scored)
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, limit)
}

/**
 * Convenience: explain why a source was picked for a particular intent. Used
 * by the brief flow UI to show "we chose this because..." tooltips.
 */
export function explainSourcePick(scored: ScoredSource): string {
  const parts: string[] = []
  if (scored.matched.length) {
    parts.push(`匹配 ${scored.matched.slice(0, 3).join(' / ')}`)
  }
  parts.push(`权威 ${scored.source.trustLevel}/10`)
  parts.push(`总分 ${scored.score.toFixed(2)}`)
  return parts.join(' · ')
}

/**
 * Pre-built intents for common Brief flow scenarios. Saves callers from
 * having to reconstruct the same intent shape every time.
 */
export const PRESET_INTENTS = {
  igamingMarketing(keywords: string[] = []): SourceQueryIntent {
    return {
      keywords: ['igaming', 'casino', 'sportsbook', ...keywords],
      preferredCategories: ['igaming', 'creative-trend', 'regulatory'],
      preferredTags: ['sportsbook', 'casino'],
      language: 'any',
      limit: 8,
    }
  },
  adSpecLookup(platform: string): SourceQueryIntent {
    return {
      keywords: [platform, 'ad spec', 'creative spec'],
      preferredCategories: ['ad-specs'],
      firstPartyOnly: true,
      limit: 5,
    }
  },
  creativeTrend(vertical: string): SourceQueryIntent {
    return {
      keywords: [vertical, 'trend', 'creative'],
      preferredCategories: ['creative-trend', 'marketing-insight'],
      limit: 6,
    }
  },
  regulatoryCheck(geo: string): SourceQueryIntent {
    return {
      keywords: [geo, 'regulation', 'compliance'],
      preferredCategories: ['regulatory'],
      firstPartyOnly: true,
      limit: 5,
    }
  },
}
