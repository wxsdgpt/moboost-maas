/**
 * Unified LLM Gateway — callLLM()
 *
 * Every LLM call in the system goes through this function.
 * It handles:
 *   1. Admin context injection (from admin_config table)
 *   2. Automatic prompt logging (to prompt_logs table)
 *   3. Error handling and retries
 *   4. Token/cost tracking
 */

import { supabaseService } from './db'

// ──── Types ────

export type LLMCallOptions = {
  // Required
  model: string                      // e.g. 'anthropic/claude-sonnet-4-6'
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>

  // Caller identification (for logging)
  caller: string                     // e.g. 'reportGenerator', 'intentDetector'
  action?: string                    // e.g. 'generate_section', 'detect_intent'

  // Optional context
  userId?: string                    // internal Supabase user id
  projectId?: string                 // project id for grouping

  // LLM params
  temperature?: number               // default 0.3
  maxTokens?: number                 // default 2000
  responseFormat?: 'text' | 'json'   // default 'text'

  // Control
  injectAdminContext?: boolean        // default true — prepend admin system_context
  skipLogging?: boolean              // default false — set true for health checks
  timeoutMs?: number                 // default 45000
}

export type LLMCallResult = {
  content: string                    // raw response text
  json?: Record<string, unknown>     // parsed JSON if responseFormat='json'
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  latencyMs: number
  logId?: string                     // prompt_logs row id
}

// ──── Admin config cache (5 min TTL) ────

let configCache: Record<string, unknown> = {}
let configCacheTime = 0
const CONFIG_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getAdminConfig(): Promise<Record<string, unknown>> {
  if (Date.now() - configCacheTime < CONFIG_CACHE_TTL && Object.keys(configCache).length > 0) {
    return configCache
  }
  try {
    const db = supabaseService()
    const { data } = await db.from('admin_config').select('key, value')
    if (data) {
      configCache = {}
      for (const row of data) {
        configCache[row.key] = row.value
      }
      configCacheTime = Date.now()
    }
  } catch (e) {
    console.error('[callLLM] Failed to load admin config:', e)
  }
  return configCache
}

// Force refresh cache (call after admin updates config)
export function invalidateConfigCache() {
  configCacheTime = 0
  configCache = {}
}

// ──── Main function ────

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

export async function callLLM(opts: LLMCallOptions): Promise<LLMCallResult> {
  const {
    model,
    messages: inputMessages,
    caller,
    action,
    userId,
    projectId,
    temperature = 0.3,
    maxTokens = 2000,
    responseFormat = 'text',
    injectAdminContext = true,
    skipLogging = false,
    timeoutMs = 45000,
  } = opts

  const startTime = Date.now()
  let adminContextText: string | null = null

  // 1. Build messages — inject admin context if enabled
  const messages = [...inputMessages]
  if (injectAdminContext) {
    try {
      const config = await getAdminConfig()
      const systemContext = config.system_context as string | undefined
      if (systemContext) {
        adminContextText = systemContext
        // If first message is system, prepend context to it
        if (messages[0]?.role === 'system') {
          messages[0] = {
            ...messages[0],
            content: `${systemContext}\n\n${messages[0].content}`,
          }
        } else {
          // Insert system message at the beginning
          messages.unshift({ role: 'system', content: systemContext })
        }
      }
    } catch (e) {
      console.error('[callLLM] Admin context injection failed:', e)
    }
  }

  // 2. Extract system/user prompts for logging
  const systemPrompt = messages.find(m => m.role === 'system')?.content ?? null
  const userPrompt = messages.filter(m => m.role === 'user').map(m => m.content).join('\n---\n')

  // 3. Call OpenRouter
  let responseText = ''
  let responseJson: Record<string, unknown> | undefined
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let status: 'success' | 'error' | 'timeout' = 'success'
  let errorMessage: string | undefined

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }
    if (responseFormat === 'json') {
      body.response_format = { type: 'json_object' }
    }

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI MAAS',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenRouter ${res.status}: ${errText}`)
    }

    const data = await res.json()
    responseText = data.choices?.[0]?.message?.content ?? ''
    inputTokens = data.usage?.prompt_tokens ?? 0
    outputTokens = data.usage?.completion_tokens ?? 0
    totalTokens = data.usage?.total_tokens ?? (inputTokens + outputTokens)

    if (responseFormat === 'json' && responseText) {
      try {
        responseJson = JSON.parse(responseText)
      } catch {
        // If JSON parse fails, keep raw text — caller can handle
        console.warn('[callLLM] JSON parse failed for response, returning raw text')
      }
    }
  } catch (e) {
    const err = e as Error
    if (err.name === 'AbortError') {
      status = 'timeout'
      errorMessage = `Timeout after ${timeoutMs}ms`
    } else {
      status = 'error'
      errorMessage = err.message
    }
    // Re-throw after logging
  }

  const latencyMs = Date.now() - startTime

  // 4. Log to prompt_logs (fire-and-forget)
  if (!skipLogging) {
    try {
      const db = supabaseService()
      const { data } = await db.from('prompt_logs').insert({
        user_id: userId || null,
        project_id: projectId || null,
        caller,
        action: action || null,
        model,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        full_messages: messages,
        request_params: { temperature, maxTokens, responseFormat },
        admin_context: adminContextText,
        response_text: responseText || null,
        response_json: responseJson || null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        latency_ms: latencyMs,
        status,
        error_message: errorMessage || null,
      }).select()

      // Try to capture the log ID from the returned data
      const logId = data?.[0]?.id
      if (logId) {
        // Store log ID on the return object
        return {
          content: responseText,
          json: responseJson,
          model,
          inputTokens,
          outputTokens,
          totalTokens,
          latencyMs,
          logId,
        }
      }
    } catch (logErr) {
      console.error('[callLLM] Failed to log prompt:', logErr)
    }
  }

  // 5. If the call failed, throw after logging
  if (status !== 'success') {
    throw new Error(`[callLLM] ${status}: ${errorMessage}`)
  }

  return {
    content: responseText,
    json: responseJson,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs,
  }
}

// ──── Convenience wrappers ────

/** Text completion — simplest form */
export async function callText(
  prompt: string,
  opts: Omit<LLMCallOptions, 'messages' | 'responseFormat'> & { systemPrompt?: string }
): Promise<string> {
  const messages: LLMCallOptions['messages'] = []
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const result = await callLLM({ ...opts, messages, responseFormat: 'text' })
  return result.content
}

/** JSON completion — returns parsed object */
export async function callJSON<T = Record<string, unknown>>(
  prompt: string,
  opts: Omit<LLMCallOptions, 'messages' | 'responseFormat'> & { systemPrompt?: string }
): Promise<T> {
  const messages: LLMCallOptions['messages'] = []
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const result = await callLLM({ ...opts, messages, responseFormat: 'json' })
  if (result.json) return result.json as T
  // Fallback: try to parse the text
  return JSON.parse(result.content) as T
}

/** Multi-turn conversation */
export async function callChat(
  messages: LLMCallOptions['messages'],
  opts: Omit<LLMCallOptions, 'messages'>
): Promise<LLMCallResult> {
  return callLLM({ ...opts, messages })
}

/** Get admin config value by key (for external use) */
export async function getAdminConfigValue<T = string>(key: string): Promise<T | null> {
  const config = await getAdminConfig()
  return (config[key] as T) ?? null
}
