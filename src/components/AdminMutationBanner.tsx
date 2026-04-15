'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Undo2, X, Dna, ChevronRight } from 'lucide-react'
import Link from 'next/link'

/**
 * Admin Mutation Notification Banner (原则3)
 *
 * Shows on all admin pages when there are pending mutations.
 * Admin can confirm or rollback directly from the banner,
 * or click through to the full mutations page.
 */

interface PendingMutation {
  id: string
  mutationType: string
  target: string
  description: string
  adlPassed: boolean
  createdAt: string
}

export default function AdminMutationBanner() {
  const [mutations, setMutations] = useState<PendingMutation[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/mutations?view=pending')
      .then((r) => r.json())
      .then((d) => { if (d.ok && d.mutations) setMutations(d.mutations) })
      .catch(() => {})
  }, [])

  const handleAction = async (mutationId: string, action: 'confirm' | 'rollback') => {
    setActing(mutationId)
    try {
      const res = await fetch('/api/admin/mutations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mutationId, action }),
      })
      const data = await res.json()
      if (data.ok) {
        setMutations((prev) => prev.filter((m) => m.id !== mutationId))
      }
    } catch {}
    setActing(null)
  }

  const visible = mutations.filter((m) => !dismissed.has(m.id))
  if (visible.length === 0) return null

  return (
    <div className="mb-6 space-y-2">
      {/* Summary bar */}
      <div
        className="rounded-xl px-5 py-3 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, rgba(233,69,96,0.15) 0%, rgba(233,69,96,0.05) 100%)',
          border: '1px solid rgba(233,69,96,0.25)',
        }}
      >
        <div className="flex items-center gap-3">
          <Dna className="w-5 h-5" style={{ color: '#e94560' }} />
          <div>
            <span className="text-sm font-semibold text-white">
              {visible.length} 项新进化修改待确认
            </span>
            <span className="text-[11px] ml-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Evolution Agent 已自主产生修改，请审核
            </span>
          </div>
        </div>
        <Link
          href="/admin/mutations"
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
          style={{ color: '#e94560', background: 'rgba(233,69,96,0.1)' }}
        >
          查看全部
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Individual mutation cards */}
      {visible.slice(0, 3).map((m) => (
        <div
          key={m.id}
          className="rounded-xl px-5 py-3 flex items-center justify-between"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: m.adlPassed ? '#34c759' : '#ff9500' }}
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-white truncate">{m.description}</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {m.mutationType} · {m.target} · {formatTime(m.createdAt)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {!m.adlPassed && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                background: 'rgba(255,149,0,0.15)', color: '#ff9500',
              }}>
                ADL警告
              </span>
            )}
            <button
              onClick={() => handleAction(m.id, 'confirm')}
              disabled={acting === m.id}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-all disabled:opacity-50"
              style={{ background: '#34c759' }}
            >
              <CheckCircle2 className="w-3 h-3" />
              确认
            </button>
            <button
              onClick={() => handleAction(m.id, 'rollback')}
              disabled={acting === m.id}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
            >
              <Undo2 className="w-3 h-3" />
              回滚
            </button>
            <button
              onClick={() => setDismissed((prev) => new Set(prev).add(m.id))}
              className="p-1 rounded transition-all"
              style={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}

      {visible.length > 3 && (
        <div className="text-center">
          <Link
            href="/admin/mutations"
            className="text-[11px] font-medium"
            style={{ color: '#e94560' }}
          >
            还有 {visible.length - 3} 项修改...
          </Link>
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}
