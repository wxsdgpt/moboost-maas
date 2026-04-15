/**
 * POST /api/brief/enrich
 *
 * Stage 2.5 / Stage 3 - 「专家补充」
 * ---------------------------------------------------------------------------
 * 输入：ClarifiedBrief（来自 /api/brief/clarify）
 * 输出：EnrichmentResult - 一组从可信源里挑出的参考材料 + LLM 给出的策略建议
 *
 * 工作流：
 *   1. 从 ClarifiedBrief 推断 query intent（关键词 / 类别 / 标签）
 *   2. 调 sourceSearch 选 top-K 可信源（不实际 fetch）
 *   3. 对其中前 N 条用 briefFetcher 抓取 ParsedReference
 *   4. 把抓取结果 + 用户已答的澄清问题喂给 LLM（或启发式），让它产出
 *      enrichmentSummary：受众洞察 / 调性建议 / 文案钩子 / 视觉关键词
 *   5. 返回完整 EnrichedBrief 草稿
 *
 * 设计原则：
 *   • 完全 server-side，UI 一次调用就能拿到完整结果
 *   • 没有 OPENROUTER_API_KEY 时走启发式 fallback，保证流程不阻塞
 *   • 抓取失败的源不影响其他源，全部失败时仍然返回 enrichment skeleton
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  ClarifiedBrief,
  EnrichedBrief,
  ParsedReference,
} from '@/lib/briefTypes'
import {
  searchSources,
  ScoredSource,
  SourceQueryIntent,
  explainSourcePick,
} from '@/lib/sourceSearch'
import { fetchUrlsAsRefs } from '@/lib/briefFetcher'
import { findSpecById } from '@/lib/assetSpecs'
import { callLLM } from '@/lib/callLLM'

export const runtime = 'nodejs'

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const ENRICH_MODEL = process.env.ENRICH_MODEL || 'anthropic/claude-sonnet-4-6'

const MAX_FETCH = 4 // 实际抓取的源数量上限（其余只展示元信息）
const MAX_SEARCH = 8 // 推荐展示的源数量

// ─── Intent inference ──────────────────────────────────────────────────

/**
 * 从 ClarifiedBrief 提炼 SourceQueryIntent。规则简单但有用：
 *   • 关键词来自用户文字描述 + 已答的澄清问题答案
 *   • category 来自选中的 targetSpecs（推断出 platform）
 *   • 文字里命中 igaming 关键词时叠加 igaming 类别
 *   • 文字里命中合规关键词时叠加 regulatory 类别
 */
function inferIntent(brief: ClarifiedBrief): SourceQueryIntent {
  const text = (brief.text || '') + ' ' + Object.values(brief.answers).join(' ')
  const lower = text.toLowerCase()

  const keywords: string[] = []
  // 取文字中长度 >= 2 的中文词或英文词作 keyword 候选（粗暴但够用）
  const tokens = text
    .split(/[\s,，。.;；:、!?\n\r/\\|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 20)
  keywords.push(...Array.from(new Set(tokens)).slice(0, 12))

  const preferredCategories: SourceQueryIntent['preferredCategories'] = []
  if (
    /igaming|casino|slot|sportsbook|博彩|赌|百家乐|老虎机|体育博彩/i.test(lower)
  ) {
    preferredCategories.push('igaming')
    preferredCategories.push('regulatory')
  }
  if (/品牌|brand|风格|tone|视觉/i.test(lower)) {
    preferredCategories.push('creative-trend')
  }
  if (/合规|监管|regulation|gdpr|kyc/i.test(lower)) {
    preferredCategories.push('regulatory')
  }

  // Spec → platform → ad-specs category
  const platformsFromSpecs = new Set<string>()
  for (const id of brief.targetSpecs) {
    const spec = findSpecById(id)
    if (spec) platformsFromSpecs.add(spec.platform)
  }
  if (platformsFromSpecs.size > 0) {
    preferredCategories.push('ad-specs')
    keywords.push(...Array.from(platformsFromSpecs))
  }

  return {
    keywords,
    preferredCategories: preferredCategories.length ? preferredCategories : undefined,
    limit: MAX_SEARCH,
    language: 'any',
  }
}

// ─── Heuristic enrichment summary ─────────────────────────────────────

interface EnrichmentSummary {
  audienceHypotheses: string[]
  toneSuggestions: string[]
  copyHooks: string[]
  visualKeywords: string[]
  riskNotes: string[]
}

function heuristicSummary(
  brief: ClarifiedBrief,
  refs: ParsedReference[],
): EnrichmentSummary {
  const lower = (brief.text || '').toLowerCase()
  const isIgaming = /igaming|casino|slot|sportsbook|博彩/i.test(lower)
  const audienceFromAnswers = brief.answers['q-audience'] || brief.answers['audience']
  const toneFromAnswers = brief.answers['q-tone'] || brief.answers['tone']

  const audience: string[] = []
  if (audienceFromAnswers) audience.push(audienceFromAnswers)
  if (isIgaming) {
    audience.push('21-35 男性核心玩家', '高频 VIP 复投人群', '沉睡 30-90 天唤回')
  } else {
    audience.push('品牌目标客群（待补充地理 / 年龄）')
  }

  const tone: string[] = []
  if (toneFromAnswers) tone.push(toneFromAnswers)
  tone.push(isIgaming ? '激进 / 高对比 / 高紧迫感' : '清晰 / 信任 / 专业')

  const copyHooks = isIgaming
    ? ['限时奖金倒计时', '存款翻倍承诺', 'VIP 邀请制独享', '本周热门赔率']
    : ['核心利益点 + 立即行动', '社会证明 + 名人/数据', '免费试用 + 零风险']

  const visualKeywords = isIgaming
    ? ['霓虹', '金色', '老虎机符号', '体育场灯光', 'CTA 高对比按钮']
    : ['真人使用场景', '产品大图', '简洁排版', '品牌主色']

  const riskNotes: string[] = []
  if (isIgaming) {
    riskNotes.push('UK/EU 投放需符合 ASA 与各地博彩监管：禁止针对 18- / 隐瞒赔率 / 暗示稳赚')
    riskNotes.push('美国大多数州禁止 iGaming 广告投放，需地理过滤')
  }
  if (refs.length === 0) {
    riskNotes.push('未抓取到任何参考页面，建议补充 URL 或 brand guidelines 文件')
  }

  return {
    audienceHypotheses: audience,
    toneSuggestions: tone,
    copyHooks,
    visualKeywords,
    riskNotes,
  }
}

// ─── LLM enrichment ────────────────────────────────────────────────────

async function llmSummary(
  brief: ClarifiedBrief,
  refs: ParsedReference[],
  scored: ScoredSource[],
): Promise<EnrichmentSummary> {
  const prompt = `你是 Moboost AI MAAS 的「Brief Enrichment Agent」。
基于用户提供的 brief 和抓取到的参考材料，请输出 5 个维度的扩充建议。

# 用户 Brief
\`\`\`json
${JSON.stringify(
  {
    text: brief.text,
    targetSpecs: brief.targetSpecs,
    answers: brief.answers,
  },
  null,
  2,
)}
\`\`\`

# 抓取到的参考页面（${refs.length} 条）
${refs
  .map(
    (r, i) =>
      `${i + 1}. [${r.pageType}] ${r.extractedAssets.copy?.title || r.url}
   ${r.extractedAssets.copy?.body?.slice(0, 200) || ''}`,
  )
  .join('\n\n')}

# 推荐的可信源（${scored.length} 条，可让你引用其品牌名）
${scored.map((s) => `• ${s.source.name} - ${s.source.description}`).join('\n')}

请输出严格 JSON：
\`\`\`json
{
  "audienceHypotheses": ["..."],
  "toneSuggestions": ["..."],
  "copyHooks": ["..."],
  "visualKeywords": ["..."],
  "riskNotes": ["..."]
}
\`\`\`
每个数组 3-5 条，简洁可执行。riskNotes 包含合规与抓取问题的提示。`

  const result = await callLLM({
    model: ENRICH_MODEL,
    messages: [{ role: 'user', content: prompt }],
    caller: 'brief/enrich',
    action: 'llm_summary',
    temperature: 0.5,
    responseFormat: 'json',
  })

  const parsed = JSON.parse(result.content)
  return {
    audienceHypotheses: parsed.audienceHypotheses || [],
    toneSuggestions: parsed.toneSuggestions || [],
    copyHooks: parsed.copyHooks || [],
    visualKeywords: parsed.visualKeywords || [],
    riskNotes: parsed.riskNotes || [],
  }
}

// ─── Route handler ─────────────────────────────────────────────────────

interface EnrichResponseSource {
  id: string
  name: string
  url: string
  category: string
  trustLevel: number
  score: number
  matched: string[]
  reason: string
}

export async function POST(req: NextRequest) {
  let brief: ClarifiedBrief
  try {
    brief = (await req.json()) as ClarifiedBrief
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!brief?.id) {
    return NextResponse.json({ error: 'missing_brief_id' }, { status: 400 })
  }

  // 1. 推断 intent
  const intent = inferIntent(brief)

  // 2. 选源
  const scored = searchSources(intent)

  // 3. 抓取前 MAX_FETCH 条源（首选 spec/regulatory/igaming，跳过 paywalled）
  const toFetch = scored
    .filter((s) => s.source.trustLevel >= 7)
    .slice(0, MAX_FETCH)
    .map((s) => s.source.url)

  let fetched: ParsedReference[] = []
  if (toFetch.length) {
    try {
      const out = await fetchUrlsAsRefs(toFetch)
      fetched = out.refs
    } catch (err) {
      // Fetch failed, continue with refs from clarify stage
    }
  }

  // 把已经在 clarify 阶段抓到的 refs 也合进来（避免重复）
  const allRefs: ParsedReference[] = [...(brief.parsedRefs || [])]
  for (const r of fetched) {
    if (!allRefs.some((x) => x.url === r.url)) allRefs.push(r)
  }

  // 4. 生成 enrichment summary
  let summary: EnrichmentSummary
  if (OPENROUTER_KEY) {
    try {
      summary = await llmSummary(brief, allRefs, scored)
    } catch (err) {
      summary = heuristicSummary(brief, allRefs)
    }
  } else {
    summary = heuristicSummary(brief, allRefs)
  }

  // 5. 组装响应
  const sourceList: EnrichResponseSource[] = scored.map((s) => ({
    id: s.source.id,
    name: s.source.name,
    url: s.source.url,
    category: s.source.category,
    trustLevel: s.source.trustLevel,
    score: Number(s.score.toFixed(3)),
    matched: s.matched,
    reason: explainSourcePick(s),
  }))

  const enriched: EnrichedBrief = {
    ...brief,
    parsedRefs: allRefs,
    item: {
      product: brief.text?.slice(0, 60) || '未命名产品',
      vertical: intent.preferredCategories?.includes('igaming') ? 'igaming' : 'general',
      tone: summary.toneSuggestions[0],
    },
    user: {
      audience: { interests: summary.audienceHypotheses },
    },
    context: {
      zeitgeist: summary.copyHooks,
    },
  }

  return NextResponse.json({
    ok: true,
    brief: enriched,
    enrichment: summary,
    sources: sourceList,
    debug: {
      intent,
      fetchedCount: fetched.length,
      llmUsed: Boolean(OPENROUTER_KEY),
    },
  })
}
