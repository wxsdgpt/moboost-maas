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
  { id: 'pipeline' as const, label: '一键联动', icon: Zap, description: 'Full pipeline' },
  { id: 'asset' as const, label: '生成素材', icon: ImageIcon, description: 'Create assets' },
  { id: 'intel' as const, label: '信息采集', icon: Search, description: 'Market intel' },
  { id: 'landing' as const, label: '生成落地页', icon: Layout, description: 'Landing page' },
]

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
              '请提供您想要分析的产品网址。您可以粘贴网站URL或应用商店链接。',
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
              '请问您想要：1) 生成竞品情报报告 2) 生成营销素材（图片/视频）3) 生成落地页 还是 4) 全套一键联动？',
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
        { role: 'assistant', content: '抱歉，处理失败了。请再试一次。' },
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
          className="rounded-xl border border-gray-200 p-4 max-h-[250px] overflow-y-auto space-y-3"
          style={{ background: '#fafafa', scrollbarWidth: 'thin' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium" style={{ color: '#999' }}>
              <MessageCircle className="w-3 h-3 inline mr-1" />
              Conversation
            </span>
            <button
              type="button"
              onClick={() => { setChatMode(false); setMessages([]) }}
              className="p-1 rounded hover:bg-gray-200 transition-colors"
            >
              <X className="w-3 h-3" style={{ color: '#999' }} />
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
                  background: msg.role === 'user' ? '#0071e3' : '#f0f0f3',
                  color: msg.role === 'user' ? '#ffffff' : '#000000',
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
        className="relative rounded-xl border border-gray-300 transition-all focus-within:border-blue-400 focus-within:shadow-sm"
        style={{ background: '#ffffff' }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedAction === 'intel'
              ? '输入产品URL或描述竞品…'
              : selectedAction === 'asset'
              ? '描述你想要生成的素材…'
              : selectedAction === 'landing'
              ? '描述落地页需求…'
              : '描述你的需求，或选择下方快捷操作…'
          }
          disabled={processing}
          className="w-full resize-none border-0 bg-transparent px-4 pt-4 pb-12 text-[15px] focus:outline-none disabled:opacity-50"
          style={{
            color: '#000000',
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
            style={{ background: '#0071e3' }}
          >
            {processing ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
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
                background: isSelected ? '#0071e3' : '#f5f5f7',
                color: isSelected ? '#ffffff' : '#333333',
                border: isSelected
                  ? '1px solid #0071e3'
                  : '1px solid #e5e5e5',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {action.label}
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div
          className="text-[13px] rounded-lg px-3 py-2"
          style={{
            background: '#ffe5e5',
            border: '1px solid #ffc9c9',
            color: '#d32f2f',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
