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
        '你好 xu，告诉我你想做什么样的素材就行 — 比如「给 iGaming 新用户做一组 IG Reel，30 秒，调性激进」。\n\n你也可以直接贴竞品链接或参考页面，我会自动抓取分析。',
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
        { role: 'assistant', content: `(出错了：${msg})` },
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
            `已完成 enrich：抓取了 ${data.sources?.length || 0} 个可信源。\n\n` +
            `受众假设：${(data.enrichment?.audienceHypotheses || []).slice(0, 3).join(' · ') || '无'}\n` +
            `调性建议：${(data.enrichment?.toneSuggestions || []).slice(0, 3).join(' · ') || '无'}\n` +
            `文案钩子：${(data.enrichment?.copyHooks || []).slice(0, 3).join(' · ') || '无'}\n` +
            `视觉关键词：${(data.enrichment?.visualKeywords || []).slice(0, 3).join(' · ') || '无'}\n\n` +
            `（完整 enrich 结果已保存。下一步进入 Stage 4 生成。）`,
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
    <main className="min-h-screen bg-white text-black flex flex-col" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-white">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#000' }}>Brief · Chat Mode</h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.48)' }}>
            Describe what you need in natural language — AI extracts links, infers specs, and asks key questions
          </p>
        </div>
        <Link
          href="/brief/new"
          className="text-xs hover:opacity-80 transition"
          style={{ color: '#0066cc' }}
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
                backgroundColor: m.role === 'user' ? '#f5f5f7' : '#f5f5f7',
                color: '#000',
              }}
            >
              {m.content}

              {m.pendingQuestions && m.pendingQuestions.length > 0 && (
                <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                  {m.pendingQuestions.map((q) => (
                    <div key={q.id}>
                      <div className="text-xs mb-1" style={{ color: 'rgba(0,0,0,0.6)' }}>
                        {q.question}
                        {q.required && <span className="ml-1" style={{ color: '#d70015' }}>*</span>}
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
                                backgroundColor: answered ? '#0071e3' : 'white',
                                color: answered ? 'white' : '#000',
                                borderColor: answered ? '#0071e3' : 'rgba(0,0,0,0.1)',
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
            <div className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: '#f5f5f7', color: 'rgba(0,0,0,0.48)' }}>
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-6 py-2 text-xs border-t" style={{ color: '#d70015', borderColor: 'rgba(215,0,21,0.2)', backgroundColor: 'rgba(215,0,21,0.06)' }}>
          {error}
        </div>
      )}

      {readyToGenerate && (
        <div className="px-6 py-3 border-t bg-white flex items-center justify-between" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
          <div className="text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
            ✓ Brief information complete. Ready for enrich phase.
          </div>
          <button
            onClick={goEnrich}
            disabled={enriching}
            className="text-sm rounded-full px-4 py-2 font-medium transition"
            style={{
              backgroundColor: '#0071e3',
              color: 'white',
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
        className="border-t px-6 py-4 flex gap-3 bg-white"
        style={{ borderColor: 'rgba(0,0,0,0.1)' }}
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
            backgroundColor: '#f5f5f7',
            borderColor: 'rgba(0,0,0,0.1)',
            color: '#000',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#0071e3'
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,113,227,0.1)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'
            e.currentTarget.style.boxShadow = 'none'
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="self-end rounded-full px-4 py-2 text-sm font-medium transition"
          style={{
            backgroundColor: loading || !input.trim() ? '#f5f5f7' : '#0071e3',
            color: loading || !input.trim() ? 'rgba(0,0,0,0.3)' : 'white',
          }}
        >
          Send
        </button>
      </form>
    </main>
  )
}
