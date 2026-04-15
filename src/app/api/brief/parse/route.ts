/**
 * POST /api/brief/parse
 * ---------------------------------------------------------------------------
 * Stage 1 "简洁模式" - xu or a marketing user types one sentence (or a short
 * paragraph) describing what they want, and we return a best-effort RawIntake
 * ready for clarify.
 *
 * Current implementation: single-agent Claude call with structured output.
 * The prompt asks the model to extract URLs, pick spec IDs, and emit a strict
 * JSON shape. Falls back to a deterministic keyword-based parser when
 * OPENROUTER_API_KEY is missing or the LLM call fails.
 *
 * Future (tracked in evolution-log.md candidate pool):
 *   Upgrade to a true multi-agent pipeline:
 *     1. Intent parser     → what do they want (banner / video / page)
 *     2. Spec suggester    → which platform / dimensions
 *     3. Reference scout   → extract URLs + auto-fetch
 *   For v1 we keep it as a single call since multi-agent round-trips are
 *   expensive and the single-call version already passes the UX bar.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { RawIntake } from '@/lib/briefTypes'
import { ASSET_SPECS, findSpecById } from '@/lib/assetSpecs'
import { callLLM } from '@/lib/callLLM'

export const runtime = 'nodejs'

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const PARSE_MODEL = process.env.PARSE_MODEL || 'anthropic/claude-sonnet-4-6'

// ─── Prompt template ──────────────────────────────────────────────────────

function buildParsePrompt(userText: string): string {
  const coreCatalog = ASSET_SPECS
    .filter((s) => s.priority === 'core')
    .map((s) => `${s.id}: ${s.nameZh} (${s.width}x${s.height} ${s.mediaType})`)
    .join('\n  ')

  return `你是 Moboost AI MAAS 的「Brief 快速解析 Agent」。

xu（营销主理人）用一句自然语言告诉你他想生成什么素材，你需要把这句话转成一个结构化的 RawIntake JSON。

# xu 的原话
"""
${userText}
"""

# 你能从这段话里找的东西
1. **text**：去掉 URL 之后的剩余意图描述（可选）
2. **urls**：所有 http(s):// 链接
3. **targetSpecs**：从下方 core 规格里挑 1-3 个最匹配的 spec id
4. **specAutoDetect**：如果用户没明确说尺寸/平台，设为 true，让 clarify 阶段继续补

# 可选 core 规格
  ${coreCatalog}

# 规则
- 只返回 JSON，不要 markdown 代码块
- targetSpecs 必须来自上面的 core id 列表，不准自造
- 如果原话里明确提到 "抖音/TikTok"、"INS/Instagram"、"YouTube Shorts" 等，优先匹配对应规格
- 如果提到 "banner/横幅/广告位" 且没有平台，选 iab-medium-rectangle + iab-leaderboard
- 如果什么都辨不出来，targetSpecs 返回空数组并把 specAutoDetect 设 true
- 所有字段如果没有内容就省略（不要返回 null 或空字符串）

# 输出格式

{
  "text": "...",
  "urls": ["https://..."],
  "targetSpecs": ["ig-reel", "tiktok-video"],
  "specAutoDetect": false,
  "confidence": 0.0-1.0,
  "reasoning": "一句话说你为什么这么选"
}
`
}

// ─── Heuristic fallback ───────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s，。；、]+/gi

interface ParseResult {
  text?: string
  urls?: string[]
  targetSpecs: string[]
  specAutoDetect: boolean
  confidence: number
  reasoning: string
}

function heuristicParse(userText: string): ParseResult {
  const urls = Array.from(userText.matchAll(URL_RE)).map((m) => m[0])
  const text = userText.replace(URL_RE, '').trim()
  const lower = text.toLowerCase()

  const hits: string[] = []
  const reasons: string[] = []

  const rules: { keywords: (string | RegExp)[]; specs: string[]; why: string }[] = [
    {
      keywords: ['抖音', 'tiktok', '短视频', /竖版/],
      specs: ['tiktok-video', 'ig-reel'],
      why: '命中短视频关键词',
    },
    {
      keywords: ['instagram', 'ins', 'reel', '小红书', /故事/],
      specs: ['ig-reel', 'ig-story'],
      why: '命中 IG/竖屏关键词',
    },
    {
      keywords: ['youtube', 'yt', 'shorts', /长视频/],
      specs: ['youtube-shorts', 'youtube-video-16x9'],
      why: '命中 YouTube 关键词',
    },
    {
      keywords: ['banner', '横幅', '广告位', 'display', '展示广告'],
      specs: ['iab-medium-rectangle', 'iab-leaderboard'],
      why: '命中展示广告关键词',
    },
    {
      keywords: ['朋友圈', '微信', 'wechat'],
      specs: ['ig-feed-square'],
      why: '微信朋友圈常用方图（暂用 IG 方图代理）',
    },
    {
      keywords: ['海报', 'poster', '竖图'],
      specs: ['ig-feed-portrait'],
      why: '命中海报/竖图关键词',
    },
    {
      keywords: ['头图', 'cover', 'header', 'hero'],
      specs: ['iab-leaderboard'],
      why: '命中头图/cover 关键词',
    },
  ]

  for (const rule of rules) {
    if (rule.keywords.some((k) => (typeof k === 'string' ? lower.includes(k) : k.test(lower)))) {
      for (const spec of rule.specs) {
        if (!hits.includes(spec) && findSpecById(spec)) hits.push(spec)
      }
      reasons.push(rule.why)
    }
  }

  return {
    text: text || undefined,
    urls: urls.length ? urls : undefined,
    targetSpecs: hits.slice(0, 3),
    specAutoDetect: hits.length === 0,
    confidence: hits.length ? 0.55 : 0.25,
    reasoning: reasons.join('；') || '未匹配到具体平台，交由 clarify 阶段补全',
  }
}

// ─── LLM path ─────────────────────────────────────────────────────────────

async function llmParse(userText: string): Promise<ParseResult> {
  const result = await callLLM({
    model: PARSE_MODEL,
    messages: [{ role: 'user', content: buildParsePrompt(userText) }],
    caller: 'brief/parse',
    action: 'llm_parse',
    temperature: 0.2,
    responseFormat: 'json',
  })

  const raw = JSON.parse(result.content) as Partial<ParseResult>

  // Validate specs against catalog - reject any hallucinated ids
  const validSpecs = (raw.targetSpecs || []).filter((id) => !!findSpecById(id))

  return {
    text: raw.text,
    urls: raw.urls,
    targetSpecs: validSpecs,
    specAutoDetect: raw.specAutoDetect ?? validSpecs.length === 0,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.7,
    reasoning: raw.reasoning || '',
  }
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const userText = (body.text || '').trim()
  if (!userText) {
    return NextResponse.json({ error: 'text_required' }, { status: 400 })
  }
  if (userText.length > 4000) {
    return NextResponse.json({ error: 'text_too_long', max: 4000 }, { status: 400 })
  }

  let result: ParseResult
  let used: 'llm' | 'heuristic' = 'heuristic'
  if (OPENROUTER_KEY) {
    try {
      result = await llmParse(userText)
      used = 'llm'
    } catch (err) {
      result = heuristicParse(userText)
    }
  } else {
    result = heuristicParse(userText)
  }

  const intake: RawIntake = {
    id: `brief_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text: result.text,
    urls: result.urls,
    targetSpecs: result.targetSpecs,
    specAutoDetect: result.specAutoDetect,
    createdAt: Date.now(),
  }

  return NextResponse.json({
    ok: true,
    intake,
    meta: {
      engine: used,
      confidence: result.confidence,
      reasoning: result.reasoning,
    },
  })
}
