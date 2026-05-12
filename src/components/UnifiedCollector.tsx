'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Send,
  Loader2,
  Globe,
  Image as ImageIcon,
  Video,
  Layout,
  Zap,
  Search,
  ArrowRight,
  MessageCircle,
  X,
} from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import {
  store, generateThinkingSteps,
  type GenerationJob, type ChatMessage as StoreChatMessage,
} from '@/lib/store'

// ──── Types ────

type Intent = 'intel' | 'asset' | 'landing' | 'pipeline' | null
type ChatMsg = { role: 'user' | 'assistant'; content: string }

type Props = {
  /** User's product info if already onboarded */
  productId?: string | null
  productName?: string | null
  productUrl?: string | null
  vertical?: string | null
  /** Compact mode for sidebar/widget usage */
  compact?: boolean
  /** Callback when a project is created and pipeline starts */
  onProjectCreated?: (projectId: string, intent: string) => void
}

const QUICK_ACTIONS = [
  { id: 'pipeline' as const, labelKey: 'collector.action.pipeline', icon: Zap, description: 'Full pipeline' },
  { id: 'asset' as const, labelKey: 'collector.action.asset', icon: ImageIcon, description: 'Create assets' },
  { id: 'intel' as const, labelKey: 'collector.action.intel', icon: Search, description: 'Market intel' },
  { id: 'landing' as const, labelKey: 'collector.action.landing', icon: Layout, description: 'Landing page' },
] as const

// ──── Quick-reply intent mapping (Phase 2 design: fast path) ────

/** Map numbered replies to intents when in clarification chatMode */
const NUMBERED_INTENT_MAP: Record<string, Intent> = {
  '1': 'intel',
  '2': 'asset',
  '3': 'landing',
  '4': 'pipeline',
}

const QUICK_REPLY_REGEX = /^([1-4])[.、)）\s]?/

/** Check if the last assistant message contains a numbered option list */
function hasNumberedOptions(msgs: ChatMsg[]): boolean {
  const last = [...msgs].reverse().find(m => m.role === 'assistant')
  if (!last) return false
  // Match patterns like "1)" "1." "1、" in the assistant text
  return /[1-4][)）.、]/.test(last.content)
}

/** Try to map a user reply to an intent via quick-path regex */
function tryQuickReplyMap(text: string, msgs: ChatMsg[]): Intent {
  if (!hasNumberedOptions(msgs)) return null
  const match = text.match(QUICK_REPLY_REGEX)
  if (!match) return null
  return NUMBERED_INTENT_MAP[match[1]] || null
}

/** Detect image vs video from prompt text (mirrors ProjectWorkspace logic) */
function detectAssetType(text: string): 'image' | 'video' {
  const lower = text.toLowerCase()
  // Use word-boundary-aware matching to avoid false positives
  // e.g. "promotional" should NOT match "motion"
  const videoPatterns = [
    /视频/, /video/, /\bclip\b/, /动画/, /\banimation\b/,
    /\bmotion\b/, /\bveo\b/, /短片/,
  ]
  return videoPatterns.some(p => p.test(lower)) ? 'video' : 'image'
}

// ──── Frontend operation logger ────

const LOG_PREFIX = '[UnifiedCollector]'

const OP_LOG_KEY = '__uc_log__'
let _flushTimer: ReturnType<typeof setTimeout> | null = null

function logOp(action: string, data?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const entry = { action, ts: new Date().toISOString(), ...data }
  console.log(LOG_PREFIX, action, data || '')
  // Append to sessionStorage log for debugging
  try {
    const prev = JSON.parse(sessionStorage.getItem(OP_LOG_KEY) || '[]') as unknown[]
    prev.push(entry)
    if (prev.length > 50) prev.splice(0, prev.length - 50)
    sessionStorage.setItem(OP_LOG_KEY, JSON.stringify(prev))
  } catch { /* quota or SSR */ }
  // Debounced flush to server so AI can read logs via API
  scheduleFlush()
}

function scheduleFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(() => {
    _flushTimer = null
    try {
      const entries = JSON.parse(sessionStorage.getItem(OP_LOG_KEY) || '[]')
      if (entries.length === 0) return
      fetch('/api/debug/op-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'unified-collector', entries }),
      }).catch(() => { /* fire and forget */ })
    } catch { /* SSR or quota */ }
  }, 2000) // flush 2s after last log
}

// ──── Main Component ────

export default function UnifiedCollector({
  productId,
  productName,
  productUrl,
  vertical,
  compact = false,
  onProjectCreated,
}: Props) {
  const router = useRouter()
  const { t } = useLocale()
  const [input, setInput] = useState('')
  const [selectedAction, setSelectedAction] = useState<Intent>(null)
  const [processing, setProcessing] = useState(false)
  const [chatMode, setChatMode] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 150) + 'px'
    }
  }, [input])

  // ── Handle submission ──

  const handleSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text && !selectedAction) return

    setError(null)
    setProcessing(true)

    // Add user message to chat
    const updatedMessages = text
      ? [...messages, { role: 'user' as const, content: text }]
      : messages
    if (text) {
      setMessages(updatedMessages)
    }

    try {
      // ── Fast path: numbered reply in chatMode ──
      if (chatMode && text) {
        const quickIntent = tryQuickReplyMap(text, updatedMessages)
        if (quickIntent) {
          logOp('quickReply.mapped', { reply: text, intent: quickIntent })
          const originalUserMsg = updatedMessages.find(m => m.role === 'user')
          const originalPrompt = originalUserMsg?.content || ''
          const isOriginalVague = !originalPrompt || /^[0-9\s.\u3001)\uff09]+$/.test(originalPrompt.trim())
          const effectivePrompt = isOriginalVague ? '' : originalPrompt
          logOp('quickReply.prompt', { original: originalPrompt, effective: effectivePrompt, vague: isOriginalVague })
          executeIntent(quickIntent, effectivePrompt)
          return
        }
      }

      // ── Normal path: detect intent via API ──
      // Build enhanced input for chatMode replies (include conversation context)
      let intentInput = text || selectedAction || ''
      if (chatMode && text && updatedMessages.length > 1) {
        const lastAssistant = [...updatedMessages].reverse().find(m => m.role === 'assistant')
        if (lastAssistant) {
          intentInput = `上一条系统提问: ${lastAssistant.content}\n用户回复: ${text}`
        }
      }

      logOp('intent.request', { input: intentInput, chatMode, selectedAction })
      const intentRes = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: intentInput,
          context: {
            productName,
            productUrl,
            vertical,
            explicitIntent: selectedAction,
            previousMessages: updatedMessages,
          },
        }),
      })
      const intentData = await intentRes.json()
      const intent = intentData.intent

      if (!intent) throw new Error('Intent detection failed')
      logOp('intent.result', { intent: intent.intent, confidence: intent.confidence, needsClarification: intent.needsClarification, needsUrl: intent.needsUrl })

      // ── Handle different scenarios ──

      // Case A: Intent clear + ready to execute
      if (intent.confidence >= 0.7 && !intent.needsClarification && !intent.needsUrl) {
        executeIntent(intent.intent, text, intent.urls)
        return
      }

      // Case B: Needs URL
      if (intent.needsUrl) {
        setChatMode(true)
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: intent.clarificationQuestion ||
              'Please provide the product URL you want to analyze. You can paste a website URL or app store link.',
          },
        ])
        setInput('')
        return
      }

      // Case C: Needs clarification
      if (intent.needsClarification || intent.confidence < 0.7) {
        setChatMode(true)
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: intent.clarificationQuestion ||
              '请问您想要：1) 生成竞品情报报告 2) 生成营销素材（图片/视频）3) 生成落地页 4) 全套一键联动？',
          },
        ])
        setInput('')
        return
      }

      // Case D: Fallback — execute best guess
      executeIntent(intent.intent, text, intent.urls)
    } catch (e) {
      setError((e as Error).message)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ])
    } finally {
      setProcessing(false)
    }
  }, [input, selectedAction, messages, chatMode, productName, productUrl, vertical])

  // ── Execute detected intent ──
  //
  // For 'asset' intent: create project + routing job in the client-side store,
  // then navigate to ProjectWorkspace which auto-starts generation via its
  // existing auto-start logic (detects job.status === 'routing').
  //
  // Store's _schedulePersist handles server-side persistence automatically.
  // No need to call POST /api/projects — this was the v2 regression that broke
  // the generation flow by creating DB-only projects unreachable by the store.

  function executeIntent(
    intent: string,
    userInput: string,
    urls: string[] = []
  ) {
    const hasPrompt = !!userInput.trim()
    const projectName = hasPrompt
      ? userInput.slice(0, 40) + (userInput.length > 40 ? '...' : '')
      : `${intent} project`

    try {
      switch (intent) {
        case 'asset': {
          // ── Store-driven asset generation (restored from v1 design) ──
          const project = hasPrompt
            ? store.createProject(projectName, {
                id: `msg-${Date.now()}`,
                role: 'user',
                content: userInput,
                timestamp: new Date().toISOString(),
              })
            : store.createProject(projectName)

          // Only auto-start generation if we have a real prompt.
          // Otherwise, navigate to the workspace and let the user
          // type their creative description there.
          if (hasPrompt) {
            const assetType = detectAssetType(userInput)
            const steps = generateThinkingSteps(assetType, userInput)
            const job: GenerationJob = {
              id: `job-${Date.now()}`,
              projectId: project.id,
              type: assetType,
              prompt: userInput,
              status: 'routing',
              createdAt: new Date().toISOString(),
              thinkingSteps: steps,
            }
            store.addJobToProject(project.id, job)
          }

          logOp('executeIntent', { intent, projectId: project.id, hasPrompt, assetType: hasPrompt ? detectAssetType(userInput) : null })
          onProjectCreated?.(project.id, intent)
          router.push(`/project/${project.id}`)
          break
        }

        case 'intel':
        case 'landing':
        case 'pipeline':
        default: {
          // ── Other intents: keep existing DB-based flow for now ──
          // TODO: migrate these to store-driven flow in a future task
          fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: projectName,
              productId: productId || null,
              source: 'homepage',
              metadata: { intent, urls, userInput },
            }),
          })
            .then(r => r.json())
            .then(projData => {
              if (projData.ok && projData.project?.id) {
                onProjectCreated?.(projData.project.id, intent)
                switch (intent) {
                  case 'intel':
                    router.push(urls.length > 0
                      ? `/project/${projData.project.id}?action=report&url=${encodeURIComponent(urls[0])}`
                      : `/project/${projData.project.id}`
                    )
                    break
                  case 'landing':
                    router.push(`/landing?projectId=${projData.project.id}`)
                    break
                  case 'pipeline':
                    router.push(`/project/${projData.project.id}?action=pipeline`)
                    break
                  default:
                    router.push(`/project/${projData.project.id}`)
                }
              } else {
                setError('Failed to create project')
              }
            })
            .catch(e => setError((e as Error).message))
          break
        }
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // ── Key handler ──

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // ── Toggle chip ──

  function toggleAction(action: Intent) {
    setSelectedAction(prev => (prev === action ? null : action))
  }

  // ── Render ──

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Chat messages (if in chat mode) */}
      {chatMode && messages.length > 0 && (
        <div
          className="rounded-xl p-4 max-h-[250px] overflow-y-auto space-y-3"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            scrollbarWidth: 'thin',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-4)' }}>
              <MessageCircle className="w-3 h-3 inline mr-1" />
              Conversation
            </span>
            <button
              type="button"
              onClick={() => { setChatMode(false); setMessages([]) }}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3" style={{ color: 'var(--text-4)' }} />
            </button>
          </div>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="rounded-xl px-3 py-2 max-w-[85%] text-[13px] leading-relaxed"
                style={{
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #c0e463, #a8d44a)'
                    : 'var(--surface-2)',
                  color: msg.role === 'user' ? 'var(--brand-contrast)' : 'var(--text-1)',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Main input area */}
      <div
        className="relative rounded-xl transition-all"
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedAction === 'intel'
              ? t('collector.placeholder.intel')
              : selectedAction === 'asset'
              ? t('collector.placeholder.asset')
              : selectedAction === 'landing'
              ? t('collector.placeholder.landing')
              : t('collector.placeholder.default')
          }
          disabled={processing}
          className="w-full resize-none border-0 bg-transparent px-4 pt-4 pb-12 text-base focus:outline-none disabled:opacity-50 placeholder:text-white/30"
          style={{
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            minHeight: compact ? '60px' : '120px',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
          rows={1}
        />
        {/* Send button */}
        <div className="absolute bottom-3 right-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={processing || (!input.trim() && !selectedAction)}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center transition-all disabled:opacity-30"
            style={{ background: 'var(--brand)' }}
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--brand-contrast)' }} />
            ) : (
              <Send className="w-4 h-4" style={{ color: 'var(--brand-contrast)' }} />
            )}
          </button>
        </div>
      </div>

      {/* Quick action chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon
          const isSelected = selectedAction === action.id
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => toggleAction(action.id)}
              disabled={processing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50"
              style={{
                background: isSelected ? 'var(--brand)' : 'var(--surface-1)',
                color: isSelected ? 'var(--brand-contrast)' : 'var(--text-2)',
                border: isSelected
                  ? '1px solid var(--brand)'
                  : '1px solid var(--border)',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(action.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div
          className="text-[13px] rounded-lg px-3 py-2"
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
