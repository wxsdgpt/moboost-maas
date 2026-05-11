'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  ChevronDown,
  Type,
  Image,
  Film,
  Eye,
  Download,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Globe,
  Layers,
  BarChart3,
  ShieldCheck,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import {
  getJob,
  getJobMatrix,
  getJobLocalized,
  getJobCompliance,
  getLocalizedAsset,
  getLocalizedDownloadUrl,
  submitJob,
  updateMatrixCell,
  type LocalizationJob as ApiJob,
  type MatrixView as ApiMatrixView,
  type MatrixRow,
  type LocalizedAssetSummary,
  type LocalizedAssetDetail,
  type ComplianceReport as ApiComplianceReport,
} from '@/lib/localization/client'

// ─── Market metadata ────────────────────────────────────────────────
const MARKET_META: Record<string, { flag: string; name: string }> = {
  US: { flag: '\u{1F1FA}\u{1F1F8}', name: 'United States' },
  UK: { flag: '\u{1F1EC}\u{1F1E7}', name: 'United Kingdom' },
  PH: { flag: '\u{1F1F5}\u{1F1ED}', name: 'Philippines' },
  IN: { flag: '\u{1F1EE}\u{1F1F3}', name: 'India' },
  BR: { flag: '\u{1F1E7}\u{1F1F7}', name: 'Brazil' },
  FR: { flag: '\u{1F1EB}\u{1F1F7}', name: 'France' },
  DE: { flag: '\u{1F1E9}\u{1F1EA}', name: 'Germany' },
  NG: { flag: '\u{1F1F3}\u{1F1EC}', name: 'Nigeria' },
}

function marketDisplay(code: string) {
  const m = MARKET_META[code.toUpperCase()] || MARKET_META[code]
  return m || { flag: '\u{1F30D}', name: code }
}

// ─── Status Colors ───────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: '#8e8e93',
  queued: '#5e5ce6',
  processing: '#ff9500',
  completed: '#34c759',
  failed: '#ff3b30',
  partial: '#ff9500',
  awaiting_confirmation: '#5e5ce6',
  confirmed: '#34c759',
  pending: '#8e8e93',
}

type Strategy = 'keep_original' | 'literal_translate' | 'light_localize' | 'transcreate' | 'user_provided' | string

// ─── Strategy chip colors ────────────────────────────────────────────
const STRATEGY_COLORS: Record<string, { bg: string; text: string }> = {
  keep_original: { bg: 'rgba(142,142,147,0.15)', text: '#8e8e93' },
  literal_translate: { bg: 'rgba(94,92,230,0.15)', text: '#5e5ce6' },
  light_localize: { bg: 'rgba(255,149,0,0.15)', text: '#ff9500' },
  transcreate: { bg: 'rgba(192,228,99,0.15)', text: '#c0e463' },
  user_provided: { bg: 'rgba(96,165,250,0.15)', text: '#60a5fa' },
}

function strategyColors(s: string) {
  return STRATEGY_COLORS[s] || { bg: 'rgba(142,142,147,0.15)', text: '#8e8e93' }
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  critical: { color: '#ff3b30', bg: 'rgba(255,59,48,0.12)', label: 'Critical', icon: AlertCircle },
  warning: { color: '#ff9500', bg: 'rgba(255,149,0,0.12)', label: 'Warning', icon: AlertTriangle },
  info: { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Info', icon: Info },
}

const LU_TYPE_ICONS: Record<string, React.ElementType> = {
  text: Type,
  visual: Image,
  audio: Film,
}

// ─── Tabs ────────────────────────────────────────────────────────────
type TabKey = 'strategy' | 'progress' | 'results' | 'compliance'

const TABS: { key: TabKey; icon: React.ElementType; label: string }[] = [
  { key: 'strategy', icon: Layers, label: 'Strategy Matrix' },
  { key: 'progress', icon: BarChart3, label: 'Progress' },
  { key: 'results', icon: Eye, label: 'Results' },
  { key: 'compliance', icon: ShieldCheck, label: 'Compliance' },
]

// ─── Main Component ──────────────────────────────────────────────────

export default function LocalizationJobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { t } = useLocale()

  const [activeTab, setActiveTab] = useState<TabKey>('strategy')
  const [apiJob, setApiJob] = useState<ApiJob | null>(null)
  const [matrix, setMatrix] = useState<ApiMatrixView | null>(null)
  const [localizedAssets, setLocalizedAssets] = useState<LocalizedAssetSummary[]>([])
  const [localizedDetails, setLocalizedDetails] = useState<Record<string, LocalizedAssetDetail>>({})
  const [complianceReports, setComplianceReports] = useState<ApiComplianceReport[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const jobId = params.jobId as string

  // Load all job data
  async function loadAll() {
    try {
      const [jobData, matrixData, localizedData, complianceData] = await Promise.allSettled([
        getJob(jobId),
        getJobMatrix(jobId),
        getJobLocalized(jobId),
        getJobCompliance(jobId),
      ])

      if (jobData.status === 'fulfilled') setApiJob(jobData.value)
      if (matrixData.status === 'fulfilled') setMatrix(matrixData.value)
      if (localizedData.status === 'fulfilled') setLocalizedAssets(localizedData.value)
      if (complianceData.status === 'fulfilled') setComplianceReports(complianceData.value)

      // Load detail for each localized asset (to get unit_outputs with translated text)
      if (localizedData.status === 'fulfilled' && localizedData.value.length > 0) {
        const details: Record<string, LocalizedAssetDetail> = {}
        const detailResults = await Promise.allSettled(
          localizedData.value.map(la => getLocalizedAsset(la.id))
        )
        detailResults.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            details[localizedData.value[i].id] = r.value
          }
        })
        setLocalizedDetails(details)
      }
    } catch {
      // Partial load is acceptable
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Track previous status for auto-tab-switch
  const prevStatusRef = useRef<string | null>(null)

  useEffect(() => {
    loadAll()
  }, [jobId])

  // Auto-poll every 4s while job is not in a terminal state
  useEffect(() => {
    const terminalStatuses = ['completed', 'failed', 'partial']
    if (!apiJob || terminalStatuses.includes(apiJob.status)) return

    const interval = setInterval(() => {
      loadAll()
    }, 4000)

    return () => clearInterval(interval)
  }, [apiJob?.status, jobId])

  // Auto-switch to Results tab when job completes
  useEffect(() => {
    if (!apiJob) return
    const prev = prevStatusRef.current
    prevStatusRef.current = apiJob.status

    if (prev && prev !== 'completed' && apiJob.status === 'completed') {
      setActiveTab('results')
    }
  }, [apiJob?.status])

  async function handleRefresh() {
    setRefreshing(true)
    await loadAll()
  }

  async function handleSubmitJob() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Fire-and-forget: don't await inline processing
      submitJob(jobId).catch(() => { /* polling will pick up status */ })
      // Update UI immediately to show processing state
      setApiJob(prev => prev ? { ...prev, status: 'queued' } : prev)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit job')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-3)' }} />
      </div>
    )
  }

  const job = apiJob
  const jobStatus = job?.status || 'draft'

  // Derive markets from matrix or localized assets
  const markets: { code: string; flag: string; name: string }[] = []
  const marketCodes = matrix?.targets || Array.from(new Set(localizedAssets.map(la => la.target_market)))
  for (const code of marketCodes) {
    const md = marketDisplay(code)
    markets.push({ code, flag: md.flag, name: md.name })
  }

  // Derive LU data from matrix
  const lus = matrix?.rows || []

  // Build strategies from matrix
  const strategies: Record<string, Record<string, Strategy>> = {}
  for (const row of lus) {
    strategies[row.lu_id] = {}
    for (const [target, cell] of Object.entries(row.cells)) {
      strategies[row.lu_id][target] = cell.strategy
    }
  }

  // Derive progress from localized assets
  const progress: Record<string, { percent: number; statusText: string }> = {}
  for (const la of localizedAssets) {
    const status = la.status
    const percent = status === 'completed' || status === 'awaiting_confirmation' || status === 'confirmed'
      ? 100
      : status === 'processing' ? 50
      : status === 'failed' ? 0
      : 0
    progress[la.target_market] = {
      percent,
      statusText: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }
  }

  const overallProgress = markets.length > 0
    ? Math.round(Object.values(progress).reduce((sum, m) => sum + m.percent, 0) / markets.length)
    : 0

  return (
    <div
      className="min-h-screen p-8 max-w-[1400px] mx-auto"
      style={{
        fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
        background: 'var(--bg)',
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-1)' }} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
              Job: {job ? `#${job.id.slice(0, 8)}` : jobId.slice(0, 8)}
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              <span
                className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                style={{
                  backgroundColor: `${STATUS_COLORS[jobStatus] || '#8e8e93'}18`,
                  color: STATUS_COLORS[jobStatus] || '#8e8e93',
                }}
              >
                {jobStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              {job?.started_at && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
                  <Clock className="w-3 h-3" />
                  {new Date(job.started_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'var(--surface-1)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Submit button (when job is draft) */}
          {jobStatus === 'draft' && (
            <button
              onClick={handleSubmitJob}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: submitting ? 'var(--surface-3)' : 'var(--brand)',
                color: submitting ? 'var(--text-3)' : 'var(--brand-contrast)',
                border: 'none',
              }}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {submitting ? 'Submitting...' : 'Submit Job'}
            </button>
          )}
        </div>
      </div>

      {submitError && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }}>
          {submitError}
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
        style={{ backgroundColor: 'var(--surface-1)' }}
      >
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all"
            style={
              activeTab === key
                ? { backgroundColor: 'var(--surface-3)', color: 'var(--text-1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
                : { color: 'var(--text-3)' }
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'strategy' && (
        <StrategyMatrixTab
          jobId={jobId}
          lus={lus}
          markets={markets}
          strategies={strategies}
        />
      )}
      {activeTab === 'progress' && (
        <ProgressTab markets={markets} progress={progress} overallProgress={overallProgress} />
      )}
      {activeTab === 'results' && (
        <ResultsTab
          markets={markets}
          localizedAssets={localizedAssets}
          localizedDetails={localizedDetails}
        />
      )}
      {activeTab === 'compliance' && (
        <ComplianceTab
          markets={markets}
          reports={complianceReports}
        />
      )}
    </div>
  )
}

// ─── Tab 1: Strategy Matrix ──────────────────────────────────────────

function StrategyMatrixTab({
  jobId,
  lus,
  markets,
  strategies,
}: {
  jobId: string
  lus: MatrixRow[]
  markets: { code: string; flag: string; name: string }[]
  strategies: Record<string, Record<string, Strategy>>
}) {
  const [localStrategies, setLocalStrategies] = useState(strategies)

  useEffect(() => {
    setLocalStrategies(strategies)
  }, [strategies])

  const handleStrategyChange = async (luId: string, marketCode: string, newStrategy: string) => {
    setLocalStrategies(prev => ({
      ...prev,
      [luId]: { ...prev[luId], [marketCode]: newStrategy },
    }))
    try {
      await updateMatrixCell(jobId, {
        lu_id: luId,
        target: marketCode,
        strategy: newStrategy,
      })
    } catch {
      // Revert on error
      setLocalStrategies(strategies)
    }
  }

  if (lus.length === 0) {
    return (
      <div className="rounded-xl p-12 border text-center" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <Layers className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>No strategy matrix yet</h3>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          The source asset needs to be parsed first. Submit the job to begin processing.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 text-left px-5 py-3 text-[11px] uppercase tracking-wider font-semibold"
                style={{ color: 'var(--text-3)', backgroundColor: 'var(--surface-1)', borderBottom: '1px solid var(--border)', minWidth: 260 }}
              >
                Localizable Unit
              </th>
              {markets.map((m) => (
                <th key={m.code} className="px-4 py-3 text-center text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)', minWidth: 140 }}>
                  <span className="mr-1.5">{m.flag}</span>{m.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lus.map((lu, idx) => {
              const Icon = LU_TYPE_ICONS[lu.lu_type] || Type
              return (
                <tr key={lu.lu_id}>
                  <td
                    className="sticky left-0 z-10 px-5 py-3.5"
                    style={{ backgroundColor: 'var(--surface-1)', borderBottom: idx < lus.length - 1 ? '1px solid var(--border)' : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--border)' }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-1)', maxWidth: 200 }}>
                          {lu.preview || lu.lu_id.slice(0, 12)}
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-block mt-0.5" style={{ backgroundColor: 'rgba(192,228,99,0.1)', color: 'var(--brand)' }}>
                          {lu.semantic_role || lu.lu_type}
                        </span>
                      </div>
                    </div>
                  </td>
                  {markets.map((m) => (
                    <td key={m.code} className="px-4 py-3.5 text-center" style={{ borderBottom: idx < lus.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <StrategyDropdown
                        value={localStrategies[lu.lu_id]?.[m.code] || 'keep_original'}
                        onChange={(v) => handleStrategyChange(lu.lu_id, m.code, v)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StrategyDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const options = ['keep_original', 'literal_translate', 'light_localize', 'transcreate', 'user_provided']
  const colors = strategyColors(value)
  const displayName = value.replace(/_/g, ' ')

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
        style={{ backgroundColor: colors.bg, color: colors.text }}
      >
        {displayName}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute z-30 mt-1 left-1/2 -translate-x-1/2 rounded-xl py-1 min-w-[160px] shadow-lg"
            style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            {options.map((opt) => {
              const c = strategyColors(opt)
              return (
                <button
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-[11px] font-medium flex items-center gap-2 transition-colors"
                  style={{ color: c.text }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.text }} />
                  {opt.replace(/_/g, ' ')}
                  {opt === value && <CheckCircle2 className="w-3 h-3 ml-auto" style={{ color: c.text }} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab 2: Progress ─────────────────────────────────────────────────

function ProgressTab({
  markets,
  progress,
  overallProgress,
}: {
  markets: { code: string; flag: string; name: string }[]
  progress: Record<string, { percent: number; statusText: string }>
  overallProgress: number
}) {
  if (markets.length === 0) {
    return (
      <div className="rounded-xl p-12 border text-center" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <BarChart3 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>No progress data yet</h3>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Submit the job to begin processing.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-6 border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Overall Progress</span>
          <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>{overallProgress}%</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${overallProgress}%`, background: 'linear-gradient(90deg, #c0e463, #a8d44a)' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {markets.map((m) => {
          const p = progress[m.code] || { percent: 0, statusText: 'Queued' }
          const barColor = p.percent === 100 ? '#34c759' : p.percent >= 50 ? '#ff9500' : '#5e5ce6'
          return (
            <div key={m.code} className="rounded-xl p-5 border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{m.flag}</span>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{m.name}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{p.statusText}</div>
                  </div>
                </div>
                <span className="text-sm font-bold" style={{ color: p.percent === 100 ? '#34c759' : 'var(--text-1)' }}>
                  {p.percent}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${p.percent}%`, backgroundColor: barColor }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab 3: Results ──────────────────────────────────────────────────

function ResultsTab({
  markets,
  localizedAssets,
  localizedDetails,
}: {
  markets: { code: string; flag: string; name: string }[]
  localizedAssets: LocalizedAssetSummary[]
  localizedDetails: Record<string, LocalizedAssetDetail>
}) {
  if (localizedAssets.length === 0) {
    return (
      <div className="rounded-xl p-12 border text-center" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <Eye className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>No results yet</h3>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Results will appear here once processing completes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
        Localized Outputs ({localizedAssets.length} market{localizedAssets.length !== 1 ? 's' : ''})
      </h3>

      {localizedAssets.map((la) => {
        const md = marketDisplay(la.target_market)
        const detail = localizedDetails[la.id]
        const unitOutputs = detail?.unit_outputs || []
        const statusColor = STATUS_COLORS[la.status] || '#8e8e93'
        const hasOutputFile = !!la.output_storage_key
        const downloadUrl = getLocalizedDownloadUrl(la.id)
        const isImageOutput = la.output_storage_key?.match(/\.(png|jpg|jpeg)$/i)
        const isProcessed = !['draft', 'processing', 'pending'].includes(la.status)

        return (
          <div
            key={la.id}
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}
          >
            {/* Header */}
            <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-lg">{md.flag}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{md.name}</span>
              {la.target_sub_market && (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>({la.target_sub_market})</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
                >
                  {la.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                {hasOutputFile && (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors"
                    style={{
                      background: 'var(--brand)',
                      color: 'var(--brand-contrast)',
                      textDecoration: 'none',
                    }}
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </a>
                )}
              </div>
            </div>

            {/* Output image preview */}
            {hasOutputFile && isImageOutput && isProcessed && (
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-3)' }}>
                  Output Preview
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={downloadUrl}
                  alt={`Localized output for ${md.name}`}
                  className="rounded-lg border max-w-full"
                  style={{ borderColor: 'var(--border)', maxHeight: 400, objectFit: 'contain', background: 'var(--surface-2)' }}
                />
              </div>
            )}

            {/* Unit outputs — translated text */}
            {unitOutputs.length > 0 ? (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {unitOutputs.map((output: Record<string, unknown>, i: number) => {
                  // Backend shape: { lu_id, strategy_applied, output_content: { text, source_text } }
                  const oc = (output.output_content as Record<string, unknown>) || {}
                  const sourceText = (oc.source_text as string) || ''
                  const targetText = (oc.text as string) || ''
                  const strategy = (output.strategy_applied as string) || ''
                  const luId = (output.lu_id as string) || ''
                  const hasError = !!(output.error as string)

                  return (
                    <div key={`${luId}-${i}`} className="px-5 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>
                            Source
                          </div>
                          <p className="text-sm" style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>
                            {sourceText || '(no text)'}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
                              Localized
                            </span>
                            {strategy && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: strategyColors(strategy).bg, color: strategyColors(strategy).text }}
                              >
                                {strategy.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          {hasError ? (
                            <p className="text-sm" style={{ color: '#ff9500', lineHeight: 1.6 }}>
                              AI translation pending — {(output.error as string).slice(0, 80)}
                            </p>
                          ) : (
                            <p className="text-sm font-medium" style={{ color: 'var(--text-1)', lineHeight: 1.6 }}>
                              {targetText || sourceText || '(no text)'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : isProcessed ? (
              <div className="px-5 py-6 text-center">
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  {hasOutputFile ? 'Output file generated — see preview above.' : 'No translatable text units detected in this asset.'}
                </p>
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  {la.status === 'processing' ? 'Processing...' : 'Waiting to process...'}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab 4: Compliance ───────────────────────────────────────────────

function ComplianceTab({
  markets,
  reports,
}: {
  markets: { code: string; flag: string; name: string }[]
  reports: ApiComplianceReport[]
}) {
  if (reports.length === 0) {
    return (
      <div className="rounded-xl p-12 border text-center" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: '#34c759' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
          No compliance reports yet
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          Compliance reports will appear after processing completes.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => {
        const md = marketDisplay(report.market)
        const findings = report.findings || []
        const statusColor = report.overall_status === 'pass' ? '#34c759' : report.overall_status === 'fail' ? '#ff3b30' : '#ff9500'

        return (
          <div
            key={report.id}
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}
          >
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: findings.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <span className="text-lg">{md.flag}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{md.name}</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium ml-auto"
                style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
              >
                {report.overall_status}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--border)', color: 'var(--text-3)' }}>
                {findings.length} finding{findings.length !== 1 ? 's' : ''}
              </span>
            </div>

            {findings.length > 0 && (
              <div>
                {findings.map((f, idx) => {
                  const sev = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info
                  const SevIcon = sev.icon
                  return (
                    <div
                      key={idx}
                      className="px-5 py-4 flex items-start gap-3"
                      style={{ borderBottom: idx < findings.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: sev.bg }}>
                        <SevIcon className="w-3.5 h-3.5" style={{ color: sev.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: sev.bg, color: sev.color }}>
                            {sev.label}
                          </span>
                          {f.code && (
                            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{f.code}</span>
                          )}
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-1)' }}>{f.message}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
