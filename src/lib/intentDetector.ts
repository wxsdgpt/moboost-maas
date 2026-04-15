/**
 * Intent Detector — Analyzes user input to determine action type.
 *
 * Used by:
 *   - Homepage unified input → route to correct pipeline
 *   - Onboarding flow → guide first-time users
 *   - Brief/chat → enhance conversation understanding
 *
 * Intent types:
 *   'intel'    — Competitive intelligence / report generation
 *   'asset'    — Generate creative assets (image or video)
 *   'landing'  — Generate a landing page
 *   'pipeline' — Full pipeline (intel + asset + landing)
 *   'unknown'  — Cannot determine; needs clarification
 */

import { callJSON, getAdminConfigValue } from './callLLM'

// ──── Types ────

export type DetectedIntent = {
  intent: 'intel' | 'asset' | 'landing' | 'pipeline' | 'unknown'
  confidence: number           // 0-1

  // Extracted data
  urls: string[]               // URLs found in input
  productName?: string         // Product/brand name if mentioned
  competitorNames: string[]    // Competitor names if mentioned

  // Asset specifics (if intent=asset)
  assetType?: 'image' | 'video' | 'both'

  // Clarification
  needsUrl: boolean            // true if we need a URL but none provided
  needsClarification: boolean  // true if intent is ambiguous
  clarificationQuestion?: string  // suggested question to ask user

  // For search
  searchSuggestions: string[]  // suggested search terms to find URLs

  // Raw reasoning
  reasoning: string
}

export type IntentContext = {
  // User's product info (if available from onboarding)
  productName?: string
  productUrl?: string
  vertical?: string

  // Conversation history (for multi-turn)
  previousMessages?: Array<{ role: 'user' | 'assistant'; content: string }>

  // Explicit selection from quick actions (if user clicked one)
  explicitIntent?: 'intel' | 'asset' | 'landing' | 'pipeline'

  // For logging
  userId?: string
  projectId?: string
}

// ──── URL extraction (regex-based, no LLM needed) ────

const URL_REGEX = /https?:\/\/[^\s<>"\])}]+/gi
const DOMAIN_LIKE_REGEX = /(?:^|\s)((?:[\w-]+\.)+(?:com|io|ai|net|org|co|app|dev|gg|bet|casino|poker|sport|game|play|win|slot|live|vip)\b(?:\/[^\s]*)?)/gi

export function extractUrls(text: string): string[] {
  const urlMap: Record<string, boolean> = {}

  // Full URLs
  const fullMatches = text.match(URL_REGEX) || []
  for (const u of fullMatches) {
    urlMap[u.replace(/[.,;!?]+$/, '')] = true // strip trailing punctuation
  }

  // Domain-like strings (add https://)
  // Use exec() loop instead of matchAll() for broader TS target compat
  const regex = new RegExp(DOMAIN_LIKE_REGEX.source, DOMAIN_LIKE_REGEX.flags)
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const domain = m[1].trim()
    if (!domain.includes('://')) {
      urlMap[`https://${domain}`] = true
    }
  }

  return Object.keys(urlMap)
}

// ──── Intent detection ────

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6'

export async function detectIntent(
  userInput: string,
  context: IntentContext = {}
): Promise<DetectedIntent> {
  // If user explicitly selected an intent (clicked quick action), trust it
  if (context.explicitIntent) {
    const urls = extractUrls(userInput)
    return {
      intent: context.explicitIntent,
      confidence: 1.0,
      urls,
      competitorNames: [],
      needsUrl: context.explicitIntent === 'intel' && urls.length === 0 && !context.productUrl,
      needsClarification: false,
      searchSuggestions: [],
      reasoning: `User explicitly selected: ${context.explicitIntent}`,
    }
  }

  const urls = extractUrls(userInput)

  // Build the prompt
  const productContext = context.productName
    ? `\nUser's registered product: "${context.productName}" (${context.productUrl || 'no URL'}, vertical: ${context.vertical || 'unknown'})`
    : ''

  const conversationContext = context.previousMessages?.length
    ? `\nPrevious conversation:\n${context.previousMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`
    : ''

  // Get admin-configured intent detection prompt
  let intentPrompt = await getAdminConfigValue<string>('intent_detection_prompt')
  if (!intentPrompt) {
    intentPrompt = 'Analyze the user input and determine intent.'
  }

  const systemPrompt = `${intentPrompt}

You are the intent detection module for Moboost AI, a marketing platform for iGaming.

Given user input, determine:
1. **intent**: What does the user want to do?
   - "intel" — They want competitive intelligence, market research, a report, or information about competitors
   - "asset" — They want to generate creative assets (images, banners, videos, ad creatives)
   - "landing" — They want to generate a landing page
   - "pipeline" — They want the full pipeline (intelligence + assets + landing page)
   - "unknown" — Cannot determine from the input alone

2. **urls**: Extract any URLs mentioned
3. **productName**: If they mention a specific product/brand name
4. **competitorNames**: Any competitor names mentioned
5. **assetType**: If asset intent, is it "image", "video", or "both"?
6. **needsUrl**: Does the requested action need a URL that wasn't provided?
7. **needsClarification**: Is the intent ambiguous?
8. **clarificationQuestion**: If ambiguous, what should we ask? (in Chinese, since our users are Chinese-speaking)
9. **searchSuggestions**: If a product/competitor is named but no URL given, suggest search terms
10. **reasoning**: Brief explanation of your analysis
${productContext}${conversationContext}`

  try {
    const model = await getAdminConfigValue<string>('default_model') || DEFAULT_MODEL

    const result = await callJSON<DetectedIntent>(
      `User input: "${userInput}"\n\nURLs already extracted: ${JSON.stringify(urls)}\n\nRespond with a JSON object matching the DetectedIntent schema.`,
      {
        model,
        caller: 'intentDetector',
        action: 'detect_intent',
        userId: context.userId,
        projectId: context.projectId,
        systemPrompt,
        temperature: 0.1,
        maxTokens: 1000,
      }
    )

    // Merge regex-extracted URLs with LLM-extracted ones (deduplicated)
    const urlSet: Record<string, boolean> = {}
    for (const u of urls) urlSet[u] = true
    for (const u of (result.urls || [])) urlSet[u] = true
    const allUrls = Object.keys(urlSet)

    return {
      ...result,
      urls: allUrls,
      competitorNames: result.competitorNames || [],
      searchSuggestions: result.searchSuggestions || [],
      needsUrl: result.needsUrl ?? false,
      needsClarification: result.needsClarification ?? false,
      confidence: result.confidence ?? 0.5,
      reasoning: result.reasoning ?? '',
    }
  } catch (e) {
    console.error('[intentDetector] LLM call failed:', e)
    // Fallback: heuristic-based detection
    return heuristicDetect(userInput, urls, context)
  }
}

// ──── Heuristic fallback (no LLM) ────

function heuristicDetect(
  input: string,
  urls: string[],
  context: IntentContext
): DetectedIntent {
  const lower = input.toLowerCase()

  // Chinese + English keyword matching
  const intelKeywords = ['竞品', '情报', '分析', '报告', 'report', 'intel', 'competitor', 'analysis', '调研', '市场', 'market']
  const assetKeywords = ['素材', '图片', '视频', '广告', 'image', 'video', 'banner', 'creative', '生成', 'generate', '设计']
  const landingKeywords = ['落地页', 'landing', '着陆页', 'page', 'lp']
  const pipelineKeywords = ['一键', '联动', 'pipeline', '全部', '全套', 'all']

  const intelScore = intelKeywords.filter(k => lower.includes(k)).length
  const assetScore = assetKeywords.filter(k => lower.includes(k)).length
  const landingScore = landingKeywords.filter(k => lower.includes(k)).length
  const pipelineScore = pipelineKeywords.filter(k => lower.includes(k)).length

  let intent: DetectedIntent['intent'] = 'unknown'
  let confidence = 0.3

  if (pipelineScore > 0) {
    intent = 'pipeline'; confidence = 0.7
  } else if (intelScore > assetScore && intelScore > landingScore) {
    intent = 'intel'; confidence = 0.6
  } else if (assetScore > intelScore && assetScore > landingScore) {
    intent = 'asset'; confidence = 0.6
  } else if (landingScore > 0) {
    intent = 'landing'; confidence = 0.6
  }

  // If URLs present and no clear intent, likely intel
  if (intent === 'unknown' && urls.length > 0) {
    intent = 'intel'; confidence = 0.5
  }

  const isVideoMentioned = lower.includes('视频') || lower.includes('video')
  const isImageMentioned = lower.includes('图片') || lower.includes('image') || lower.includes('banner')

  return {
    intent,
    confidence,
    urls,
    competitorNames: [],
    assetType: isVideoMentioned && isImageMentioned ? 'both' : isVideoMentioned ? 'video' : isImageMentioned ? 'image' : undefined,
    needsUrl: intent === 'intel' && urls.length === 0 && !context.productUrl,
    needsClarification: intent === 'unknown',
    clarificationQuestion: intent === 'unknown' ? '请问您想要：1) 生成竞品情报报告 2) 生成营销素材（图片/视频）3) 生成落地页 还是 4) 全套一键联动？' : undefined,
    searchSuggestions: [],
    reasoning: `Heuristic fallback: intel=${intelScore}, asset=${assetScore}, landing=${landingScore}, pipeline=${pipelineScore}`,
  }
}

// ──── Multi-turn clarification helper ────

/**
 * Given a previous DetectedIntent and the user's clarification response,
 * re-analyze to produce a more confident intent.
 */
export async function refinIntent(
  clarificationResponse: string,
  previousIntent: DetectedIntent,
  context: IntentContext = {}
): Promise<DetectedIntent> {
  const messages = context.previousMessages || []
  messages.push({
    role: 'assistant',
    content: previousIntent.clarificationQuestion || 'What would you like to do?',
  })
  messages.push({
    role: 'user',
    content: clarificationResponse,
  })

  return detectIntent(clarificationResponse, {
    ...context,
    previousMessages: messages,
  })
}
