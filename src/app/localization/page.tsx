'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Plus, Clock, Image, Video, Type, Loader2, AlertCircle } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import { getJobs, type LocalizationJob, type JobStatus } from '@/lib/localization/client'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MARKETS = [
  { code: 'US', flag: '\u{1F1FA}\u{1F1F8}', name: 'United States', complexity: 3 },
  { code: 'UK', flag: '\u{1F1EC}\u{1F1E7}', name: 'United Kingdom', complexity: 2 },
  { code: 'PH', flag: '\u{1F1F5}\u{1F1ED}', name: 'Philippines', complexity: 1 },
  { code: 'IN', flag: '\u{1F1EE}\u{1F1F3}', name: 'India', complexity: 3 },
  { code: 'BR', flag: '\u{1F1E7}\u{1F1F7}', name: 'Brazil', complexity: 1 },
  { code: 'FR', flag: '\u{1F1EB}\u{1F1F7}', name: 'France', complexity: 2 },
  { code: 'DE', flag: '\u{1F1E9}\u{1F1EA}', name: 'Germany', complexity: 3 },
  { code: 'NG', flag: '\u{1F1F3}\u{1F1EC}', name: 'Nigeria', complexity: 2 },
] as const

const STATUS_COLORS: Record<string, string> = {
  draft: '#8e8e93',
  queued: '#ff9500',
  processing: '#ff9500',
  completed: '#34c759',
  failed: '#ff3b30',
  partial: '#5e5ce6',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LocalizationPage() {
  const { t } = useLocale()
  const router = useRouter()
  const [jobs, setJobs] = useState<LocalizationJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getJobs()
      setJobs(data)
    } catch (e) {
      // If backend isn't running, show empty state gracefully
      const msg = e instanceof Error ? e.message : 'Failed to load jobs'
      if (msg.includes('service_unavailable') || msg.includes('fetch')) {
        setJobs([])
        setError(null) // Don't show error for backend-down case
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const totalJobs = jobs.length
  const inProgress = jobs.filter((j) => j.status === 'processing' || j.status === 'queued').length
  const completed = jobs.filter((j) => j.status === 'completed').length
  const allMarkets = new Set<string>()
  for (let i = 0; i < jobs.length; i++) {
    const tm = jobs[i].target_markets
    if (tm) for (let k = 0; k < tm.length; k++) allMarkets.add(tm[k])
  }
  const marketsActive = allMarkets.size

  const stats = [
    { label: 'Total Jobs', value: totalJobs },
    { label: 'In Progress', value: inProgress },
    { label: 'Completed', value: completed },
    { label: 'Markets Active', value: `${marketsActive} / ${MARKETS.length}` },
  ]

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: 'var(--bg)', fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
    >
      <div className="mx-auto max-w-5xl px-6 py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--brand-light)', border: '1px solid rgba(192,228,99,0.2)' }}
              >
                <Globe className="w-5 h-5" style={{ color: 'var(--brand)' }} />
              </div>
              <h1
                style={{
                  fontSize: '36px', fontWeight: 600, lineHeight: 1.1,
                  letterSpacing: '-0.4px', color: 'var(--text-1)',
                }}
              >
                {t('loc.title')}
              </h1>
            </div>
            <p style={{ fontSize: '15px', color: 'var(--text-4)' }}>
              {t('loc.subtitle')}
            </p>
          </div>

          <button
            onClick={() => router.push('/localization/new')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand)', color: '#000' }}
          >
            <Plus className="w-4 h-4" />
            {t('loc.newJob')}
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl px-5 py-5"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: '13px', color: 'var(--text-4)', marginBottom: '6px' }}>
                {s.label}
              </div>
              <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.1 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Job list */}
        <div className="mb-14">
          <h2
            className="mb-5"
            style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.2px' }}
          >
            Localization Jobs
          </h2>

          {loading ? (
            <div
              className="rounded-2xl text-center py-20 px-6 flex flex-col items-center gap-3"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            >
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-4)' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-4)' }}>Loading jobs...</span>
            </div>
          ) : error ? (
            <div
              className="rounded-2xl text-center py-20 px-6 flex flex-col items-center gap-3"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            >
              <AlertCircle className="w-8 h-8" style={{ color: '#ff3b30' }} />
              <span style={{ fontSize: '14px', color: '#ff3b30' }}>{error}</span>
              <button
                onClick={fetchJobs}
                className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}
              >
                Retry
              </button>
            </div>
          ) : jobs.length === 0 ? (
            <div
              className="rounded-2xl text-center py-20 px-6"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'var(--border)' }}
              >
                <Globe className="w-8 h-8" style={{ color: 'var(--text-5)' }} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-1)', marginBottom: '8px' }}>
                {t('loc.noJobs')}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-4)', maxWidth: '380px', margin: '0 auto', lineHeight: 1.5 }}>
                {t('loc.noJobs.desc')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => router.push(`/localization/${job.id}`)}
                  className="rounded-xl p-4 flex items-center gap-4 transition-colors cursor-pointer"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-3)'
                    e.currentTarget.style.borderColor = 'rgba(192,228,99,0.12)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--surface-1)'
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="font-semibold truncate"
                        style={{ fontSize: '15px', color: 'var(--text-1)' }}
                      >
                        Job #{job.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(job.target_markets || []).map((code: string) => {
                        const m = MARKETS.find((mk) => mk.code === code)
                        return (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}
                          >
                            {m?.flag} {m?.name || code}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span
                      className="text-[10px] uppercase tracking-wide font-semibold px-2.5 py-0.5 rounded-full"
                      style={{
                        color: STATUS_COLORS[job.status] || '#8e8e93',
                        background: `${STATUS_COLORS[job.status] || '#8e8e93'}18`,
                        border: `1px solid ${STATUS_COLORS[job.status] || '#8e8e93'}30`,
                      }}
                    >
                      {job.status}
                    </span>
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: 'var(--text-4)' }}
                    >
                      <Clock className="w-3 h-3" />
                      {timeAgo(job.started_at || job.completed_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Markets reference */}
        <div>
          <h2
            className="mb-5"
            style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.2px' }}
          >
            Supported Markets
          </h2>

          <div className="grid grid-cols-4 gap-3">
            {MARKETS.map((m) => (
              <div
                key={m.code}
                className="rounded-xl px-4 py-4 flex items-center gap-3"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
              >
                <span style={{ fontSize: '28px', lineHeight: 1 }}>{m.flag}</span>
                <div className="flex-1 min-w-0">
                  <div
                    className="font-semibold truncate"
                    style={{ fontSize: '14px', color: 'var(--text-1)', lineHeight: 1.2 }}
                  >
                    {m.name}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className="rounded-full"
                        style={{
                          width: '16px', height: '4px',
                          background: level <= m.complexity ? 'var(--brand)' : 'var(--border)',
                        }}
                      />
                    ))}
                    <span className="ml-1" style={{ fontSize: '10px', color: 'var(--text-5)' }}>
                      complexity
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
