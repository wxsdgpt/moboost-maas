/**
 * Context Builder — assembles project context for generation prompts.
 *
 * Responsibilities:
 *   1. Extract relevant history from project messages
 *   2. Summarize existing assets
 *   3. Build system prompt with brand/style context
 *   4. Trim to configurable token limits
 *
 * Used by: /api/generate, /api/generate-video
 * Does NOT import from Presentation layer (pure domain logic).
 */

import { getContextConfig, type ContextConfig } from './contextConfig'

// ──── Types ────

export interface ProjectContext {
  /** Project ID */
  projectId: string
  /** Project name */
  projectName: string
  /** Conversation messages (user + assistant) */
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp?: string
  }>
  /** Already-generated assets in this project */
  assets: Array<{
    type: 'image' | 'video'
    prompt: string
    createdAt: string
    evaluationSummary?: string
  }>
  /** Brief/brand context if available */
  brief?: {
    productName?: string
    vertical?: string
    targetAudience?: string
    tone?: string
    style?: string
  }
}

export interface BuiltPrompt {
  /** System prompt with project context */
  systemPrompt: string
  /** Messages array to send to the model */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  /** Metadata for logging */
  meta: {
    contextMessagesUsed: number
    assetsIncluded: number
    estimatedChars: number
    config: ContextConfig
  }
}

// ──── Builder ────

/**
 * Build a contextualized prompt for asset generation.
 *
 * @param currentPrompt - The user's current generation request
 * @param type - 'image' or 'video'
 * @param context - Project context (messages, assets, brief)
 * @param configOverrides - Optional overrides for context config
 */
export function buildGenerationPrompt(
  currentPrompt: string,
  type: 'image' | 'video',
  context: ProjectContext | null,
  configOverrides?: Partial<ContextConfig>,
): BuiltPrompt {
  const config = { ...getContextConfig(), ...configOverrides }

  // No context available — simple single-message prompt
  if (!context) {
    return {
      systemPrompt: '',
      messages: [{ role: 'user', content: currentPrompt }],
      meta: {
        contextMessagesUsed: 0,
        assetsIncluded: 0,
        estimatedChars: currentPrompt.length,
        config,
      },
    }
  }

  const parts: string[] = []

  // 1. Brand/brief context
  if (context.brief) {
    const b = context.brief
    const briefLines: string[] = []
    if (b.productName) briefLines.push(`Brand: ${b.productName}`)
    if (b.vertical) briefLines.push(`Industry: ${b.vertical}`)
    if (b.targetAudience) briefLines.push(`Target audience: ${b.targetAudience}`)
    if (b.tone) briefLines.push(`Tone: ${b.tone}`)
    if (b.style) briefLines.push(`Visual style: ${b.style}`)
    if (briefLines.length > 0) {
      parts.push(`## Brand Context\n${briefLines.join('\n')}`)
    }
  }

  // 2. Asset summary
  if (config.includeAssetSummary && context.assets.length > 0) {
    const assetLines = context.assets.map((a, i) => {
      let line = `${i + 1}. [${a.type}] "${a.prompt}"`
      if (a.evaluationSummary && config.includeEvaluationFeedback) {
        line += ` — Feedback: ${a.evaluationSummary}`
      }
      return line
    })
    parts.push(`## Previously Generated Assets (${context.assets.length})\n${assetLines.join('\n')}`)
  }

  // 3. Project name
  if (context.projectName) {
    parts.push(`## Project: ${context.projectName}`)
  }

  // Build system prompt
  const typeLabel = type === 'video' ? 'video ad creative' : 'marketing image'
  const systemParts = [
    `You are a professional ${typeLabel} generator for the iGaming industry.`,
    `Generate high-quality ${type === 'video' ? 'video' : 'image'} content based on the user's description.`,
  ]

  if (parts.length > 0) {
    systemParts.push('\n--- Project Context ---')
    systemParts.push(parts.join('\n\n'))
    systemParts.push('--- End Context ---')
    systemParts.push('\nUse the above context to maintain consistency with previous assets and brand guidelines.')
  }

  const systemPrompt = systemParts.join('\n')

  // 4. Build messages with conversation history
  const historyMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  // Add relevant conversation history (trimmed to config limit)
  if (config.maxContextMessages > 0 && context.messages.length > 0) {
    // Take the most recent N messages, excluding generation status messages
    const relevantMsgs = context.messages
      .filter(m => m.content && !m.content.startsWith('Generating') && !m.content.startsWith('Running D1-D4'))
      .slice(-config.maxContextMessages)

    for (const msg of relevantMsgs) {
      historyMessages.push({ role: msg.role, content: msg.content })
    }
  }

  // Assemble final messages
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: currentPrompt },
  ]

  // 5. Trim to char limit
  let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  while (totalChars > config.maxContextChars && historyMessages.length > 0) {
    // Remove oldest history message
    const removed = historyMessages.shift()
    if (removed) {
      totalChars -= removed.content.length
      // Rebuild messages array
      messages.length = 0
      messages.push({ role: 'system', content: systemPrompt })
      messages.push(...historyMessages)
      messages.push({ role: 'user', content: currentPrompt })
    }
  }

  return {
    systemPrompt,
    messages,
    meta: {
      contextMessagesUsed: historyMessages.length,
      assetsIncluded: context.assets.length,
      estimatedChars: totalChars,
      config,
    },
  }
}
