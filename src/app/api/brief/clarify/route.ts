/**
 * POST /api/brief/clarify
 * ---------------------------------------------------------------------------
 * Stage 2 of the brief flow.
 *
 * Input  : RawIntake (Stage 1 output) - text + URLs + uploaded assets +
 *          optional pre-selected targetSpecs
 * Output : ClarifiedBrief - adds parsedRefs (skeleton for now), reconciled
 *          targetSpecs (auto-detected if user clicked "let AI pick"), and a
 *          list of pendingQuestions the user still needs to answer.
 *
 * If `OPENROUTER_API_KEY` is set we call the LLM with the prompt template
 * defined in `buildClarifyPrompt()` and parse a JSON response. Otherwise we
 * fall back to a deterministic heuristic based on which RawIntake fields are
 * empty - useful for local dev without burning credits, and as a safety net
 * if the LLM returns malformed JSON.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  RawIntake,
  ClarifiedBrief,
  ClarificationQuestion,
  ParsedReference,
} from '@/lib/briefTypes'
import { ASSET_SPECS, findSpecById, AssetSpec } from '@/lib/assetSpecs'
import { fetchUrlsAsRefs } from '@/lib/briefFetcher'
import { callLLM } from '@/lib/callLLM'

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const CLARIFY_MODEL = process.env.CLARIFY_MODEL || 'anthropic/claude-sonnet-4-6'

// ────────────────────────────────────────────────────────────────────────────
// Prompt template
// ────────────────────────────────────────────────────────────────────────────

/**
 * Builds the prompt sent to the LLM.
 * The model receives:
 *   1. A short role description (Brief Architect / 需求分析师)
 *   2. The raw intake serialized as JSON
 *   3. The list of currently selected target specs (or empty)
 *   4. A short summary of the available spec catalog (so the model can suggest
 *      a reasonable spec if the user didn't pick one)
 *   5. Strict output schema - the model MUST return JSON
 */
function buildClarifyPrompt(
  intake: RawIntake,
  liveRefs?: ParsedReference[],
): string {
  const selectedSpecs = intake.targetSpecs
    .map(id => findSpecById(id))
    .filter((s): s is AssetSpec => !!s)
    .map(s => `${s.id}  ${s.nameZh}  ${s.width}x${s.height}  ${s.mediaType}`)
    .join('\n  ') || '(none - user did not pre-select)'

  // Compact catalog: only core priority entries to keep prompt small
  const catalog = ASSET_SPECS
    .filter(s => s.priority === 'core')
    .map(s => `${s.id}: ${s.nameZh} (${s.width}x${s.height} ${s.mediaType})`)
    .join('\n  ')

  return `你是 Moboost AI MAAS 的「需求分析师 Agent」。
你的任务是把营销人员零散的需求输入，整理成一个结构化、可执行的 brief。

${liveRefs && liveRefs.length ? `# 已抓取的参考页面（请基于这些真实数据，而不是猜测）
\`\`\`json
${JSON.stringify(
  liveRefs.map(r => ({
    url: r.url,
    pageType: r.pageType,
    title: r.extractedAssets.copy?.title,
    body: r.extractedAssets.copy?.body?.slice(0, 300),
    heroImage: r.extractedAssets.heroImage,
    bannerCount: r.extractedAssets.banners?.length || 0,
    videoCount: r.extractedAssets.videos?.length || 0,
  })),
  null,
  2,
)}
\`\`\`

` : ''}# 当前用户输入（Raw Intake）
\`\`\`json
${JSON.stringify(
  {
    text: intake.text || null,
    urls: intake.urls || [],
    images: (intake.images || []).map(a => ({
      filename: a.filename,
      caption: a.caption,
      width: a.width,
      height: a.height,
    })),
    videos: (intake.videos || []).map(a => ({
      filename: a.filename,
      caption: a.caption,
      durationSec: a.durationSec,
    })),
    files: (intake.files || []).map(a => ({ filename: a.filename })),
    specAutoDetect: intake.specAutoDetect,
  },
  null,
  2,
)}
\`\`\`

# 用户已选择的产出规格
  ${selectedSpecs}

# 你可以推荐的常用规格（仅显示 core 级别）
  ${catalog}

# 你的工作

1. **解析参考资料**：如果用户提供了 URL 或图片/视频，给每个参考生成一个 parsedRef
   骨架，标注 pageType（product / landing / article / social / unknown）和你推测的
   extractedAssets 类型。这一步先不做实际抓取，仅基于已有信息给出最佳推断。

2. **校准 targetSpecs**：
   - 如果用户已经选了规格，原样保留
   - 如果 specAutoDetect=true 或没选，请从 catalog 中推荐 1-3 个最贴合的规格 id

3. **生成澄清问题（核心）**：列出用户没说清楚、但生成 brief 必需的字段。每条问题给出
   - field：字段名（如 audience / tone / cta / brandColors / duration / language）
   - question：用中文写的、礼貌且具体的提问
   - choices：可选，如果是有限枚举就给 3-5 个候选项（用户可点击）
   - required：是否必填（true/false）
   常见必填字段：目标受众、品牌名称/调性、核心 CTA、文案语言；视频还需要时长。
   不要问已经在用户输入里有答案的字段。最多 5 条。

# 输出格式（必须是合法 JSON，没有任何额外文字）

\`\`\`json
{
  "parsedRefs": [
    { "url": "...", "pageType": "landing", "extractedAssets": {} }
  ],
  "targetSpecs": ["ig-reel", "tiktok-video"],
  "pendingQuestions": [
    {
      "id": "q1",
      "field": "audience",
      "question": "这条素材主要面向哪类玩家？",
      "choices": ["新注册玩家", "沉睡老玩家", "高净值 VIP", "全量推送"],
      "required": true
    }
  ]
}
\`\`\`
`
}

// ────────────────────────────────────────────────────────────────────────────
// Heuristic fallback (no LLM)
// ────────────────────────────────────────────────────────────────────────────

function heuristicClarify(
  intake: RawIntake,
  liveRefs?: ParsedReference[],
): {
  parsedRefs: ParsedReference[]
  targetSpecs: string[]
  pendingQuestions: ClarificationQuestion[]
} {
  // Prefer real fetched refs, fall back to bare-url skeletons
  const parsedRefs: ParsedReference[] = liveRefs && liveRefs.length
    ? liveRefs
    : (intake.urls || []).map(url => ({
        url,
        pageType: 'unknown' as const,
        extractedAssets: {},
      }))

  // If user didn't pick specs, default to a sensible core set based on what
  // they uploaded: video upload → suggest ig-reel + tiktok-video; otherwise
  // image-only → suggest ig-feed-square + ig-feed-portrait
  let targetSpecs = intake.targetSpecs
  if (targetSpecs.length === 0) {
    if ((intake.videos?.length ?? 0) > 0) {
      targetSpecs = ['ig-reel', 'tiktok-video']
    } else if ((intake.images?.length ?? 0) > 0 || intake.text) {
      targetSpecs = ['ig-feed-square', 'ig-feed-portrait']
    }
  }

  const pending: ClarificationQuestion[] = []

  // Heuristic: ask for fields the user clearly didn't mention
  const text = (intake.text || '').toLowerCase()
  const mentionsAudience = /受众|玩家|用户|target|audience|vip|新人|老用户/.test(text)
  const mentionsTone = /调性|风格|tone|style|严肃|活泼|高端|年轻/.test(text)
  const mentionsCTA = /cta|按钮|号召|立即|领取|注册|下载|action/.test(text)
  const mentionsLanguage = /中文|英文|english|chinese|语言|language|繁体/.test(text)

  if (!mentionsAudience) {
    pending.push({
      id: 'q-audience',
      field: 'audience',
      question: '这条素材主要面向哪类用户？',
      choices: ['新注册玩家', '沉睡老用户', '高净值 VIP', '全量推送'],
      required: true,
    })
  }
  if (!mentionsTone) {
    pending.push({
      id: 'q-tone',
      field: 'tone',
      question: '想要的视觉/文案调性是？',
      choices: ['活泼激进', '高端优雅', '简洁极简', '科技未来感'],
      required: true,
    })
  }
  if (!mentionsCTA) {
    pending.push({
      id: 'q-cta',
      field: 'cta',
      question: '主要的 CTA 是？',
      choices: ['立即注册', '领取奖金', '下载 App', '查看赔率'],
      required: true,
    })
  }
  if (!mentionsLanguage) {
    pending.push({
      id: 'q-language',
      field: 'language',
      question: '文案语言？',
      choices: ['简体中文', '繁体中文', 'English', '多语言'],
      required: true,
    })
  }

  // If any selected spec is video, ask for duration if it isn't already known
  const hasVideoSpec = targetSpecs
    .map(id => findSpecById(id))
    .some(s => s?.mediaType === 'video')
  if (hasVideoSpec && !/秒|s\b|second|duration|时长/.test(text)) {
    pending.push({
      id: 'q-duration',
      field: 'duration',
      question: '视频期望多长？',
      choices: ['6 秒', '15 秒', '30 秒', '60 秒'],
      required: true,
    })
  }

  return { parsedRefs, targetSpecs, pendingQuestions: pending.slice(0, 5) }
}

// ────────────────────────────────────────────────────────────────────────────
// LLM call
// ────────────────────────────────────────────────────────────────────────────

async function llmClarify(intake: RawIntake, liveRefs?: ParsedReference[]) {
  const prompt = buildClarifyPrompt(intake, liveRefs)

  const result = await callLLM({
    model: CLARIFY_MODEL,
    messages: [{ role: 'user', content: prompt }],
    caller: 'brief/clarify',
    action: 'llm_clarify',
    temperature: 0.4,
    responseFormat: 'json',
  })

  const parsed = JSON.parse(result.content)
  // If we already fetched real refs, prefer them over LLM-hallucinated ones.
  return {
    parsedRefs:
      liveRefs && liveRefs.length
        ? liveRefs
        : ((parsed.parsedRefs || []) as ParsedReference[]),
    targetSpecs: (parsed.targetSpecs || intake.targetSpecs) as string[],
    pendingQuestions: (parsed.pendingQuestions || []) as ClarificationQuestion[],
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Route handler
// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let intake: RawIntake
  try {
    intake = (await req.json()) as RawIntake
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!intake.id) {
    return NextResponse.json({ error: 'intake.id is required' }, { status: 400 })
  }

  // Step 1: pre-fetch any reference URLs so the LLM (and the heuristic) get
  // real titles + hero images + body copy instead of bare URLs.
  let liveRefs: ParsedReference[] = []
  if (intake.urls && intake.urls.length) {
    try {
      const out = await fetchUrlsAsRefs(intake.urls)
      liveRefs = out.refs
      // Continue with partial refs even if some failed
    } catch (err) {
      // Ref fetch failed, continue with heuristic
    }
  }

  let result: {
    parsedRefs: ParsedReference[]
    targetSpecs: string[]
    pendingQuestions: ClarificationQuestion[]
  }

  if (OPENROUTER_KEY) {
    try {
      result = await llmClarify(intake, liveRefs)
    } catch (err) {
      result = heuristicClarify(intake, liveRefs)
    }
  } else {
    result = heuristicClarify(intake, liveRefs)
  }

  const clarified: ClarifiedBrief = {
    ...intake,
    parsedRefs: result.parsedRefs,
    targetSpecs: result.targetSpecs,
    pendingQuestions: result.pendingQuestions,
    answers: {},
  }

  return NextResponse.json({ ok: true, brief: clarified })
}
