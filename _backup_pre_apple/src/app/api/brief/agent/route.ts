/**
 * POST /api/brief/agent
 *
 * Stage 1 - Chat-mode（自然语言版）的后端编排器
 * ---------------------------------------------------------------------------
 * Stage 1 picker UI 是给"知道自己要什么"的高级用户用的；
 * 这个接口给"只想用一句话描述需求"的普通用户用。
 *
 * 编排策略：multi-agent 串行管线
 *   1. **Intent Agent**：把自由文本拆成 RawIntake（推断 specs / 收集 URLs / 抽取 references）
 *   2. **Clarify Agent**：复用 /api/brief/clarify 的逻辑（fetch + LLM/启发式），
 *      产出 ClarifiedBrief
 *   3. **Enrich Agent**：复用 /api/brief/enrich 的可信源 + 总结
 *
 * 输入：{ message, history, briefId? }
 *   - message: 用户最新一句自然语言
 *   - history: 之前的多轮对话（可选）
 *   - briefId: 如果是延续之前的 brief 则带上
 *
 * 输出：{ brief, enrichment, sources, assistantMessage, nextActions }
 *   - assistantMessage: 给 chat UI 显示的助手回复
 *   - nextActions: ['ask-clarify' | 'ready-to-generate' | 'need-asset-upload']
 *
 * 注意：这个接口刻意做成"无状态" - 完整 brief 状态在响应里返回，
 * 客户端负责把它存到 localStorage 或者下次请求带回来。这避免了
 * Stage 1/2/3 之间的 server-side session 复杂度。
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  RawIntake,
  ClarifiedBrief,
  ParsedReference,
  ClarificationQuestion,
} from '@/lib/briefTypes'
import { ASSET_SPECS, findSpecById } from '@/lib/assetSpecs'
import { fetchUrlsAsRefs } from '@/lib/briefFetcher'

export const runtime = 'nodejs'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const AGENT_MODEL = process.env.AGENT_MODEL || 'anthropic/claude-sonnet-4-6'

// ─── Types ─────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AgentRequest {
  message: string
  history?: ChatMessage[]
  briefId?: string
  /** 客户端可以把上一轮的 brief 状态回传，避免 server session */
  prevBrief?: Partial<ClarifiedBrief>
}

type NextAction = 'ask-clarify' | 'ready-to-generate' | 'need-asset-upload' | 'need-url'

interface AgentResponse {
  ok: boolean
  brief: ClarifiedBrief
  assistantMessage: string
  nextActions: NextAction[]
  /** 如果有未答的澄清问题，列出来便于 UI 直接渲染选择项 */
  pendingQuestions: ClarificationQuestion[]
}

// ─── Agent 1: Intent extraction ────────────────────────────────────────

interface ExtractedIntent {
  text: string
  urls: string[]
  inferredSpecIds: string[]
  notes: string[]
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'）)]+/gi

/**
 * 从最新一句消息 + 历史里抽取意图。
 * 这里不调 LLM -- 只做正则 + 规则匹配，保证：
 *   • 总能跑（无 OPENROUTER_API_KEY 时也工作）
 *   • <50ms 完成
 *   • LLM 只在 Clarify Agent 里调一次
 */
function extractIntent(message: string, history: ChatMessage[] = []): ExtractedIntent {
  const fullText = [...history.map((h) => h.content), message].join('\n')
  const urls = Array.from(new Set(fullText.match(URL_RE) || [])).slice(0, 10)
  const lower = fullText.toLowerCase()

  // 规则：根据关键词推断 specs
  const inferredSpecIds: string[] = []
  const wantVideo = /视频|video|reel|短视频|tiktok|youtube/i.test(lower)
  const wantImage = /图|banner|海报|poster|image|图片/i.test(lower)
  const wantStory = /story|快拍|故事/i.test(lower)
  const wantSquare = /方形|square|1:1/i.test(lower)
  const wantPortrait = /竖|portrait|9:?16/i.test(lower)

  if (/tiktok/i.test(lower)) inferredSpecIds.push('tiktok-video')
  if (/instagram|ins|reel/i.test(lower)) inferredSpecIds.push('ig-reel')
  if (/youtube.*shorts?|shorts/i.test(lower)) inferredSpecIds.push('youtube-shorts')
  if (/youtube/i.test(lower) && !inferredSpecIds.includes('youtube-shorts')) {
    inferredSpecIds.push('youtube-in-stream')
  }
  if (wantStory) inferredSpecIds.push('ig-story')
  if (wantSquare && !inferredSpecIds.length) inferredSpecIds.push('ig-feed-square')
  if (wantPortrait && !inferredSpecIds.length) inferredSpecIds.push('ig-feed-portrait')

  // 兜底：用户有视频/图片意图但没匹到具体 platform → 给一个常用默认
  if (!inferredSpecIds.length) {
    if (wantVideo) inferredSpecIds.push('ig-reel', 'tiktok-video')
    else if (wantImage) inferredSpecIds.push('ig-feed-square')
  }

  // 去重 + 过滤掉 ASSET_SPECS 里不存在的 id
  const valid = Array.from(new Set(inferredSpecIds)).filter((id) => findSpecById(id))

  const notes: string[] = []
  if (urls.length) notes.push(`检测到 ${urls.length} 个参考链接`)
  if (valid.length) notes.push(`推断目标规格: ${valid.join(', ')}`)

  return {
    text: message,
    urls,
    inferredSpecIds: valid,
    notes,
  }
}

// ─── Agent 2: Clarify (LLM or heuristic) ───────────────────────────────

async function clarifyWithLlm(
  brief: RawIntake,
  refs: ParsedReference[],
): Promise<{ targetSpecs: string[]; pendingQuestions: ClarificationQuestion[] }> {
  const catalog = ASSET_SPECS.filter((s) => s.priority === 'core')
    .map((s) => `${s.id}: ${s.nameZh} (${s.width}x${s.height} ${s.mediaType})`)
    .join('\n')

  const refSummaries = refs
    .map(
      (r, i) =>
        `${i + 1}. [${r.pageType}] ${r.extractedAssets.copy?.title || r.url}\n   ${
          r.extractedAssets.copy?.body?.slice(0, 200) || ''
        }`,
    )
    .join('\n')

  const prompt = `你是 Moboost AI MAAS 的「Brief Clarifier」（在 chat 模式下运行）。
用户给了一句自然语言需求，你的任务是：
1. 决定目标产出规格（targetSpecs，从 catalog 里选）
2. 找出还需要用户澄清的字段（pendingQuestions）

# 用户的描述
${brief.text || '(无文字描述)'}

# 用户当前已选规格
${brief.targetSpecs.join(', ') || '(无)'}

# 已抓取的参考页面
${refSummaries || '(无)'}

# 可选规格 catalog
${catalog}

输出严格 JSON：
\`\`\`json
{
  "targetSpecs": ["ig-reel"],
  "pendingQuestions": [
    {"id":"q1","field":"audience","question":"...","choices":[],"required":true}
  ]
}
\`\`\`
最多 4 条 pendingQuestions。已经在用户描述里出现的字段不要再问。`

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
      'X-Title': 'Moboost AI MAAS - Chat Agent',
    },
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  })
  if (!res.ok) throw new Error(`Agent LLM failed: ${res.status}`)
  const data = await res.json()
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
  return {
    targetSpecs: parsed.targetSpecs || brief.targetSpecs,
    pendingQuestions: parsed.pendingQuestions || [],
  }
}

function clarifyHeuristic(
  brief: RawIntake,
): { targetSpecs: string[]; pendingQuestions: ClarificationQuestion[] } {
  const text = (brief.text || '').toLowerCase()
  const pending: ClarificationQuestion[] = []

  if (!/受众|玩家|user|target|audience/i.test(text)) {
    pending.push({
      id: 'q-audience',
      field: 'audience',
      question: '这条素材主要面向哪类用户？',
      choices: ['新注册玩家', '沉睡老用户', '高净值 VIP', '全量推送'],
      required: true,
    })
  }
  if (!/调性|风格|tone|style/i.test(text)) {
    pending.push({
      id: 'q-tone',
      field: 'tone',
      question: '想要的视觉/文案调性是？',
      choices: ['活泼激进', '高端优雅', '简洁极简', '科技未来感'],
      required: true,
    })
  }
  if (!/cta|按钮|action|注册|下载/i.test(text)) {
    pending.push({
      id: 'q-cta',
      field: 'cta',
      question: '主要的 CTA 是？',
      choices: ['立即注册', '领取奖金', '下载 App', '查看赔率'],
      required: true,
    })
  }

  return {
    targetSpecs: brief.targetSpecs,
    pendingQuestions: pending.slice(0, 4),
  }
}

// ─── Orchestrator ──────────────────────────────────────────────────────

function buildAssistantMessage(
  brief: ClarifiedBrief,
  intent: ExtractedIntent,
  refs: ParsedReference[],
): { text: string; nextActions: NextAction[] } {
  const lines: string[] = []
  const actions: NextAction[] = []

  if (intent.notes.length) {
    lines.push(intent.notes.join(' · '))
  }

  if (refs.length > 0) {
    lines.push(`已抓取 ${refs.length} 个参考页面：${refs
      .map((r) => r.extractedAssets.copy?.title || r.url)
      .slice(0, 3)
      .join(' / ')}`)
  } else if (intent.urls.length === 0) {
    lines.push('如果你有竞品页 / 灵感参考网址，发我一下我可以一起分析。')
    actions.push('need-url')
  }

  if (brief.targetSpecs.length === 0) {
    lines.push('我还没确定要做哪种规格的素材，你想要 video / 图片 / banner 哪一种？')
  } else {
    const names = brief.targetSpecs
      .map((id) => findSpecById(id)?.nameZh || id)
      .join(' / ')
    lines.push(`目标规格已锁定：${names}`)
  }

  if (brief.pendingQuestions.length > 0) {
    lines.push(`还有 ${brief.pendingQuestions.length} 个问题需要你确认（见下方）。`)
    actions.push('ask-clarify')
  } else {
    lines.push('信息基本齐全，可以进入 enrich + 生成阶段。')
    actions.push('ready-to-generate')
  }

  return {
    text: lines.join('\n\n'),
    nextActions: actions,
  }
}

export async function POST(req: NextRequest) {
  let body: AgentRequest
  try {
    body = (await req.json()) as AgentRequest
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'missing_message' }, { status: 400 })
  }

  // 1. Intent
  const intent = extractIntent(body.message, body.history)

  // 2. Build a RawIntake (merge with prevBrief if any)
  const prev = body.prevBrief || {}
  const intake: RawIntake = {
    id:
      body.briefId ||
      prev.id ||
      `brief_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text: [prev.text, intent.text].filter(Boolean).join('\n\n'),
    urls: Array.from(new Set([...(prev.urls || []), ...intent.urls])),
    images: prev.images,
    videos: prev.videos,
    files: prev.files,
    targetSpecs: Array.from(
      new Set([...(prev.targetSpecs || []), ...intent.inferredSpecIds]),
    ),
    specAutoDetect: false,
    createdAt: prev.createdAt || Date.now(),
  }

  // 3. Fetch any new URLs server-side
  let refs: ParsedReference[] = (prev.parsedRefs as ParsedReference[]) || []
  const newUrls = (intake.urls || []).filter((u) => !refs.some((r) => r.url === u))
  if (newUrls.length) {
    try {
      const out = await fetchUrlsAsRefs(newUrls)
      refs = [...refs, ...out.refs]
    } catch (err) {
      console.warn('[agent] url fetch failed:', err)
    }
  }

  // 4. Clarify
  let clarification: { targetSpecs: string[]; pendingQuestions: ClarificationQuestion[] }
  if (OPENROUTER_KEY) {
    try {
      clarification = await clarifyWithLlm(intake, refs)
    } catch (err) {
      console.warn('[agent] LLM clarify failed, falling back:', err)
      clarification = clarifyHeuristic(intake)
    }
  } else {
    clarification = clarifyHeuristic(intake)
  }

  // 5. Build ClarifiedBrief
  const brief: ClarifiedBrief = {
    ...intake,
    parsedRefs: refs,
    targetSpecs: clarification.targetSpecs,
    pendingQuestions: clarification.pendingQuestions,
    answers: (prev.answers as Record<string, string>) || {},
  }

  // 6. Compose assistant message
  const { text: assistantMessage, nextActions } = buildAssistantMessage(
    brief,
    intent,
    refs,
  )

  const response: AgentResponse = {
    ok: true,
    brief,
    assistantMessage,
    nextActions,
    pendingQuestions: clarification.pendingQuestions,
  }

  return NextResponse.json(response)
}
