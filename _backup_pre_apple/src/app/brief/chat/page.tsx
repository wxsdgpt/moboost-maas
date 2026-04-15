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
            `（完整 enrich 结果已经在控制台 console.log。下一步进入 Stage 4 生成。）`,
        },
      ])
      console.log('[chat] enrich result', data)
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
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Brief · Chat 模式</h1>
          <p className="text-xs text-neutral-400">
            自然语言描述你的需求，AI 会自动抓取链接、推断规格、追问关键信息
          </p>
        </div>
        <Link
          href="/brief/new"
          className="text-xs text-neutral-400 hover:text-neutral-100 underline"
        >
          切换到高级 picker 模式 →
        </Link>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-100'
              }`}
            >
              {m.content}

              {m.pendingQuestions && m.pendingQuestions.length > 0 && (
                <div className="mt-3 space-y-3 border-t border-neutral-700 pt-3">
                  {m.pendingQuestions.map((q) => (
                    <div key={q.id}>
                      <div className="text-xs text-neutral-300 mb-1">
                        {q.question}
                        {q.required && <span className="text-red-400 ml-1">*</span>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(q.choices || []).map((c) => {
                          const answered = brief?.answers?.[q.id] === c
                          return (
                            <button
                              key={c}
                              onClick={() => answerQuestion(q, c)}
                              disabled={loading}
                              className={`text-xs rounded-full px-3 py-1 border transition ${
                                answered
                                  ? 'bg-blue-500 border-blue-400 text-white'
                                  : 'bg-neutral-900 border-neutral-700 hover:border-neutral-500'
                              }`}
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
            <div className="bg-neutral-800 rounded-2xl px-4 py-3 text-sm text-neutral-400">
              思考中…
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-6 py-2 text-xs text-red-400 border-t border-red-900/40 bg-red-950/30">
          {error}
        </div>
      )}

      {readyToGenerate && (
        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-900 flex items-center justify-between">
          <div className="text-xs text-neutral-300">
            ✓ Brief 信息已齐全，可以进入 enrich 阶段拉取可信源补充
          </div>
          <button
            onClick={goEnrich}
            disabled={enriching}
            className="text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 font-medium"
          >
            {enriching ? 'Enriching…' : '进入 enrich →'}
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="border-t border-neutral-800 px-6 py-4 flex gap-3"
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
          placeholder="描述你想做的素材，或者贴一个参考链接…"
          className="flex-1 resize-none rounded-lg bg-neutral-900 border border-neutral-700 focus:border-blue-500 outline-none px-3 py-2 text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="self-end rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          发送
        </button>
      </form>
    </main>
  )
}
