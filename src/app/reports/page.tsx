'use client'

/**
 * /reports — global list of every report the current user has generated,
 * regardless of which project it lives in.
 *
 * Why this exists: it's a defensive fallback. Even though every new report
 * is now stamped with a project_id and visible on /project/[id], anything
 * generated before the wiring change (or any future row that slips through
 * with a NULL project_id) would otherwise be invisible to the user. This
 * page guarantees the artifact is always reachable.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Clock, Loader2, AlertCircle, ChevronRight } from 'lucide-react'

type ReportRow = {
  id: string
  product_id: string | null
  kind: string
  status: string
  credits_charged: number | null
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function statusColor(s: string): string {
  if (s === 'done') return 'var(--brand)'
  if (s === 'running') return '#f59e0b'
  if (s === 'failed') return '#ef4444'
  return 'var(--text-4)'
}

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/reports/generate', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (!data.ok) {
          setError(data.error || 'failed_to_load')
          setReports([])
          return
        }
        setReports(data.reports ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setReports([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = reports === null
  const total = reports?.length ?? 0

  return (
    <div
      style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', background: 'var(--bg)' }}
      className="min-h-screen"
    >
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-12">
          <h1
            style={{ lineHeight: '1.07', color: 'var(--text-1)' }}
            className="text-5xl font-semibold tracking-tight mb-2"
          >
            Reports
          </h1>
          <p style={{ color: 'var(--text-4)' }} className="text-base">
            {loading ? 'Loading…' : `${total} report${total !== 1 ? 's' : ''}`}
          </p>
        </div>

        {error && (
          <div
            style={{ backgroundColor: 'rgba(255,82,82,0.08)', borderColor: 'rgba(255,82,82,0.2)' }}
            className="rounded-lg p-4 mb-8 border max-w-2xl text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <div>
              <div className="font-medium mb-1" style={{ color: 'var(--danger)' }}>Failed to load reports</div>
              <div className="text-xs" style={{ color: 'var(--danger)' }}>{error}</div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm py-12" style={{ color: 'var(--text-4)' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading reports…
          </div>
        )}

        {!loading && total === 0 && !error && (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: 'var(--surface-1)' }}>
              <FileText className="w-10 h-10" style={{ color: 'var(--text-5)' }} />
            </div>
            <h2 style={{ lineHeight: '1.1', color: 'var(--text-1)' }} className="text-2xl font-semibold mb-3">
              No reports yet
            </h2>
            <p style={{ color: 'var(--text-4)' }} className="text-base">
              Generate one from Home — it&apos;ll appear here automatically.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {(reports ?? []).map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/report/${r.id}`)}
              style={{ backgroundColor: 'var(--surface-1)' }}
              className="w-full text-left rounded-lg overflow-hidden transition-colors"
            >
              <div className="flex items-center gap-4 p-4">
                <div
                  style={{ backgroundColor: 'var(--brand-light)' }}
                  className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                >
                  <FileText className="w-6 h-6" style={{ color: 'var(--brand)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      style={{ lineHeight: '1.1', color: 'var(--text-1)' }}
                      className="text-base font-semibold truncate"
                    >
                      {r.kind === 'competitive-brief' ? 'Competitive Brief' : `${r.kind[0].toUpperCase()}${r.kind.slice(1)} Report`}
                    </h3>
                    <span
                      className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: statusColor(r.status), backgroundColor: 'var(--border)' }}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-3 h-3" style={{ color: 'var(--text-4)' }} />
                    <span style={{ color: 'var(--text-4)' }} className="text-xs">
                      {timeAgo(r.created_at)}
                    </span>
                    {r.credits_charged !== null && (
                      <>
                        <span style={{ color: 'var(--text-5)' }}>·</span>
                        <span style={{ color: 'var(--text-4)' }} className="text-xs">
                          {r.credits_charged} credit{r.credits_charged !== 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: 'var(--text-5)' }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
