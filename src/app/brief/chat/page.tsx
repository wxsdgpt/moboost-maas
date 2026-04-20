/**
 * Stage 1 — Chat Mode（自然语言简洁版）
 * ---------------------------------------------------------------------------
 * 这一页给「不想点 picker、只想用一句话描述需求」的普通用户。
 *
 * 工作模式：
 *   • 用户在输入框里写自由文本（可贴 URL）
 *   • 前端把 message + history + prevBrief 一起 POST 到 /api/brief/agent
 *   • 服务端 multi-agent (Intent → Clarify) 返回新的 brief 状态、assistantMessage、
 *     pendingQuestions、nextActions
 *   • 客户端把 brief 存在内存里，下一轮回传 → 实现无 server session
 *
 * 当 nextActions 包含 'ready-to-generate'，显示「进入 enrich 阶段」按钮，
 * 点击后调用 /api/brief/enrich 并跳转到 enrich 页（暂未实现的话留 console.log）。
 *
 * 与 /brief/new 的关系：
 *   • /brief/new → 高级用户的 picker 模式
 *   • /brief/chat → 普通用户的对话模式
 *   两者共享 RawIntake / ClarifiedBrief 数据结构，最终都汇入 enrich → execute。
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ClarifiedBrief,
  ClarificationQuestion,
} from '@/lib/briefTypes'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** 仅 assistant 消息有：附带的 pendingQuestions 渲染卡片 */
  pendingQuestions?: ClarificationQuestion[]
  nextActions?: string[]
}

interface AgentResponse {
  ok: boolean
  brief: ClarifiedBrief
  assistantMessage: string
  nextActions: string[]
  pendingQuestions: ClarificationQuestion[]
}

export default function BriefChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hi — just tell me what kind of creative you want, e.g. "Make an IG Reel for new iGaming users, 30s, aggressive tone."\n\nYou can also paste a competitor link or reference page, and I\'ll fetch and analyze it automatically.',
    },
  ])
  const [input, setInput] = useState('')
  const [brief, setBrief] = useState<Partial<ClarifiedBrief> | null>(null)
  const [loading, setLoading] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send(userText: string) {
    if (!userText.trim() || loading) return
    setError(null)
    const next: ChatMessage = { role: 'user', content: userText }
    const newMessages = [...messages, next]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/brief/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          briefId: brief?.id,
          prevBrief: brief || undefined,
        }),
      })
      if (!res.ok) throw new Error(`agent http ${res.status}`)
      const data = (await res.json()) as AgentResponse
      setBrief(data.brief)
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: data.assistantMessage,
          pendingQuestions: data.pendingQuestions,
          nextActions: data.nextActions,
        },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `(Error: ${msg})` },
      ])
    } finally {
      setLoading(false)
    }
  }

  function answerQuestion(q: ClarificationQuestion, choice: string) {
    // 把答案合并进 brief.answers，然后作为下一轮 user 消息发出去
    const updatedBrief: Partial<ClarifiedBrief> = {
      ...(brief || {}),
      answers: { ...(brief?.answers || {}), [q.id]: choice },
    }
    setBrief(updatedBrief)
    send(`${q.question} → ${choice}`)
  }

  async function goEnrich() {
    if (!brief?.id) return
    setEnriching(true)
    setError(null)
    try {
      const res = await fetch('/api/brief/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brief),
      })
      if (!res.ok) throw new Error(`enrich http ${res.status}`)
      const data = await res.json()
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            `Enrich complete: fetched ${data.sources?.length || 0} trusted sources.\n\n` +
            `Audience hypotheses: ${(data.enrichment?.audienceHypotheses || []).slice(0, 3).join(' · ') || 'none'}\n` +
            `Tone suggestions: ${(data.enrichment?.toneSuggestions || []).slice(0, 3).join(' · ') || 'none'}\n` +
            `Copy hooks: ${(data.enrichment?.copyHooks || []).slice(0, 3).join(' · ') || 'none'}\n` +
            `Visual keywords: ${(data.enrichment?.visualKeywords || []).slice(0, 3).join(' · ') || 'none'}\n\n` +
            `(Full enrich results saved. Next: Stage 4 generation.)`,
        },
      ])
      setBrief(data.brief)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setEnriching(false)
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const readyToGenerate = lastAssistant?.nextActions?.includes('ready-to-generate')

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <header className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--nav-bg)', backdropFilter: 'saturate(120%) blur(24px)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Brief · Chat Mode</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
            Describe what you need in natural language — AI extracts links, infers specs, and asks key questions
          </p>
        </div>
        <Link
          href="/brief/new"
          className="text-xs hover:opacity-80 transition"
          style={{ color: 'var(--brand)' }}
        >
          Switch to advanced picker →
        </Link>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="max-w-2xl rounded-2xl px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed"
              style={{
                ...(m.role === 'user'
                  ? { background: 'linear-gradient(135deg, #c0e463, #a8d44a)', color: 'var(--brand-contrast)' }
                  : { backgroundColor: 'var(--surface-2)', color: 'var(--text-1)' }),
              }}
            >
              {m.content}

              {m.pendingQuestions && m.pendingQuestions.length > 0 && (
                <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: 'var(--surface-3)' }}>
                  {m.pendingQuestions.map((q) => (
                    <div key={q.id}>
                      <div className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>
                        {q.question}
                        {q.required && <span className="ml-1" style={{ color: 'var(--danger)' }}>*</span>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(q.choices || []).map((c) => {
                          const answered = brief?.answers?.[q.id] === c
                          return (
                            <button
                              key={c}
                              onClick={() => answerQuestion(q, c)}
                              disabled={loading}
                              className="text-xs rounded-full px-3 py-1 border transition"
                              style={{
                                backgroundColor: answered ? 'var(--brand)' : 'var(--surface-2)',
                                color: answered ? 'var(--brand-contrast)' : 'var(--text-1)',
                                borderColor: answered ? 'var(--brand)' : 'var(--surface-3)',
                              }}
                            >
                              {c}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-4)' }}>
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-6 py-2 text-xs border-t" style={{ color: 'var(--danger)', borderColor: 'rgba(255,82,82,0.2)', backgroundColor: 'var(--danger-bg)' }}>
          {error}
        </div>
      )}

      {readyToGenerate && (
        <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'var(--nav-bg)', backdropFilter: 'saturate(120%) blur(24px)', borderTop: '1px solid var(--border)' }}>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            ✓ Brief information complete. Ready for enrich phase.
          </div>
          <button
            onClick={goEnrich}
            disabled={enriching}
            className="text-sm rounded-full px-4 py-2 font-medium transition"
            style={{
              backgroundColor: 'var(--brand)',
              color: 'var(--brand-contrast)',
              opacity: enriching ? 0.5 : 1,
            }}
          >
            {enriching ? 'Enriching…' : 'Start Enrich →'}
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="border-t px-6 py-4 flex gap-3"
        style={{ background: 'var(--nav-bg)', backdropFilter: 'saturate(120%) blur(24px)', borderColor: 'var(--border)' }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          rows={2}
          placeholder="Describe your content needs or paste a reference link…"
          className="flex-1 resize-none rounded-lg border outline-none px-3 py-2 text-sm"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--surface-3)',
            color: 'var(--text-1)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand)'
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(192,228,99,0.1)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--surface-3)'
            e.currentTarget.style.boxShadow = 'none'
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="self-end rounded-full px-4 py-2 text-sm font-medium transition"
          style={{
            backgroundColor: loading || !input.trim() ? 'var(--surface-1)' : 'var(--brand)',
            color: loading || !input.trim() ? 'var(--text-5)' : 'var(--brand-contrast)',
          }}
        >
          Send
        </button>
      </form>
    </main>
  )
}
