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
    if (text) {
      setMessages(prev => [...prev, { role: 'user', content: text }])
    }

    try {
      // 1. Detect intent
      const intentRes = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text || selectedAction || '',
          context: {
            productName,
            productUrl,
            vertical,
            explicitIntent: selectedAction,
            previousMessages: messages,
          },
        }),
      })
      const intentData = await intentRes.json()
      const intent = intentData.intent

      if (!intent) throw new Error('Intent detection failed')

      // 2. Handle different scenarios

      // Case A: Intent clear + ready to execute
      if (intent.confidence >= 0.7 && !intent.needsClarification && !intent.needsUrl) {
        await executeIntent(intent.intent, text, intent.urls)
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
              'Which would you like: 1) Generate a competitive intelligence report, 2) Generate marketing creatives (images/videos), 3) Generate a landing page, or 4) The full one-click pipeline?',
          },
        ])
        setInput('')
        return
      }

      // Case D: Fallback — execute best guess
      await executeIntent(intent.intent, text, intent.urls)
    } catch (e) {
      setError((e as Error).message)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ])
    } finally {
      setProcessing(false)
    }
  }, [input, selectedAction, messages, productName, productUrl, vertical])

  // ── Execute detected intent ──

  async function executeIntent(
    intent: string,
    userInput: string,
    urls: string[] = []
  ) {
    // Create a project
    const projectName = userInput.slice(0, 60) || `${intent} project`

    try {
      const projRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          productId: productId || null,
          source: 'homepage',
          metadata: { intent, urls, userInput },
        }),
      })
      const projData = await projRes.json()

      if (projData.ok && projData.project?.id) {
        onProjectCreated?.(projData.project.id, intent)

        // Route to appropriate destination
        switch (intent) {
          case 'intel':
            if (productId) {
              // Generate report directly
              router.push(`/project/${projData.project.id}?action=report`)
            } else if (urls.length > 0) {
              router.push(`/project/${projData.project.id}?action=report&url=${encodeURIComponent(urls[0])}`)
            } else {
              router.push(`/project/${projData.project.id}`)
            }
            break
          case 'asset':
            router.push(`/project/${projData.project.id}?action=generate`)
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
        throw new Error('Failed to create project')
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
          className="w-full resize-none border-0 bg-transparent px-4 pt-4 pb-12 text-[15px] focus:outline-none disabled:opacity-50 placeholder:text-white/30"
          style={{
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            minHeight: compact ? '60px' : '80px',
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
