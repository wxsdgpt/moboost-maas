'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dna,
  CheckCircle2,
  Undo2,
  Clock,
  AlertTriangle,
  Activity,
  Loader2,
  Play,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  FileText,
  Search,
  RefreshCw,
  BarChart3,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

interface Mutation {
  id: string
  mutationType: string
  target: string
  description: string
  changes: { before: unknown; after: unknown }
  rollbackData: unknown
  isRolledBack: boolean
  status: string
  triggeredBy: string
  decisionId: string | null
  candidateId: string | null
  adlPassed: boolean
  adlReport: {
    stabilityCheck: { passed: boolean; reason: string }
    explainabilityCheck: { passed: boolean; reason: string }
    reusabilityCheck: { passed: boolean; reason: string }
    noveltyBiasCheck: { passed: boolean; reason: string }
    rollbackPlan: string
    failureCondition: string
    verdict: string
    overallReason: string
  } | null
  createdAt: string
}

interface ChangelogEntry {
  id: string
  level: string
  category: string
  message: string
  details: unknown
  mutationId: string | null
  createdAt: string
}

interface Candidate {
  id: string
  source: string
  title: string
  description: string
  capabilityShape: { input: string; output: string; invariants: string[]; variables: string[]; failurePoints: string[] }
  vfmScore: { expectationMatch: number; clientGrowth: number; speed: number; simplicity: number; quality: number; coverage: number; totalWeighted: number }
  totalScore: number
  status: string
  evidence: Array<{ type: string; description: string }>
  discoveredAt: string
}

type TabKey = 'pending' | 'history' | 'candidates' | 'changelog'

// ─── Component ────────────────────────────────────────────────────────

export default function AdminMutationsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [pendingMutations, setPending] = useState<Mutation[]>([])
  const [historyMutations, setHistory] = useState<Mutation[]>([])
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [runningPCEC, setRunningPCEC] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pcecResult, setPcecResult] = useState<unknown>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, hRes, cRes, candRes] = await Promise.all([
        fetch('/api/admin/mutations?view=pending'),
        fetch('/api/admin/mutations?view=history'),
        fetch('/api/admin/mutations?view=changelog&limit=50'),
        fetch('/api/admin/mutations?view=candidates'),
      ])
      const [p, h, c, cand] = await Promise.all([pRes.json(), hRes.json(), cRes.json(), candRes.json()])
      if (p.ok) setPending(p.mutations)
      if (h.ok) setHistory(h.mutations)
      if (c.ok) setChangelog(c.entries)
      if (cand.ok) setCandidates(cand.candidates)
    } catch (err) {
      // Fetch failed silently
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = async (mutationId: string, action: 'confirm' | 'rollback') => {
    setActing(mutationId)
    try {
      const res = await fetch('/api/admin/mutations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mutationId, action }),
      })
      const data = await res.json()
      if (data.ok) await fetchData()
    } catch {}
    setActing(null)
  }

  const runPCEC = async () => {
    setRunningPCEC(true)
    setPcecResult(null)
    try {
      const res = await fetch('/api/admin/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pcec', periodDays: 7 }),
      })
      const data = await res.json()
      if (data.ok) {
        setPcecResult(data.result)
        await fetchData()
      }
    } catch {}
    setRunningPCEC(false)
  }

  const tabs: Array<{ key: TabKey; icon: React.ElementType; label: string; count?: number }> = [
    { key: 'pending', icon: AlertTriangle, label: '待确认', count: pendingMutations.length },
    { key: 'history', icon: Clock, label: '修改历史' },
    { key: 'candidates', icon: Zap, label: '能力候选', count: candidates.filter((c) => c.status === 'approved').length },
    { key: 'changelog', icon: FileText, label: '进化日志' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e94560' }} />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <Dna className="w-6 h-6" style={{ color: '#e94560' }} />
            进化管理
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            7层进化架构 · PCEC · ADL · VFM · 一键回滚
          </p>
        </div>
        <button
          onClick={runPCEC}
          disabled={runningPCEC}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #e94560 0%, #c23152 100%)',
            boxShadow: '0 4px 16px rgba(233, 69, 96, 0.3)',
          }}
        >
          {runningPCEC ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {runningPCEC ? 'PCEC运行中...' : '运行PCEC周期'}
        </button>
      </div>

      {/* PCEC Result */}
      {pcecResult !== null && (
        <PCECResultCard result={pcecResult} onClose={() => setPcecResult(null)} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="待确认修改" value={pendingMutations.length.toString()} icon={AlertTriangle} color={pendingMutations.length > 0 ? '#e94560' : '#34c759'} />
        <StatCard label="已确认" value={historyMutations.filter((m) => m.status === 'confirmed').length.toString()} icon={CheckCircle2} color="#34c759" />
        <StatCard label="已回滚" value={historyMutations.filter((m) => m.status === 'rolled_back').length.toString()} icon={Undo2} color="#ff9500" />
        <StatCard label="能力候选" value={candidates.length.toString()} icon={BarChart3} color="#5e5ce6" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: 'var(--surface-3)' }}>
        {tabs.map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all"
            style={{
              color: activeTab === key ? 'var(--text-1)' : 'var(--text-2)',
              background: activeTab === key ? 'rgba(233,69,96,0.2)' : 'transparent',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count !== undefined && count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{
                background: activeTab === key ? 'rgba(233,69,96,0.4)' : 'var(--border-strong)',
              }}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'pending' && (
        <MutationList
          mutations={pendingMutations}
          onAction={handleAction}
          acting={acting}
          expanded={expanded}
          setExpanded={setExpanded}
          showActions
        />
      )}
      {activeTab === 'history' && (
        <MutationList
          mutations={historyMutations}
          onAction={handleAction}
          acting={acting}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
      {activeTab === 'candidates' && (
        <CandidateList candidates={candidates} />
      )}
      {activeTab === 'changelog' && (
        <ChangelogList entries={changelog} />
      )}
    </div>
  )
}

// ─── Sub Components ──────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )
}

function MutationList({ mutations, onAction, acting, expanded, setExpanded, showActions }: {
  mutations: Mutation[]
  onAction: (id: string, action: 'confirm' | 'rollback') => void
  acting: string | null
  expanded: string | null
  setExpanded: (id: string | null) => void
  showActions?: boolean
}) {
  if (mutations.length === 0) {
    return (
      <div className="rounded-xl p-12 text-center" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
        <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <p className="text-sm text-white">{showActions ? '没有待确认的修改' : '暂无修改历史'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {mutations.map((m) => (
        <div key={m.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setExpanded(expanded === m.id ? null : m.id)}
            className="w-full text-left px-5 py-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{
                backgroundColor: m.status === 'confirmed' ? '#34c759' : m.status === 'rolled_back' ? '#ff9500' : m.adlPassed ? 'var(--brand)' : '#ff9500',
              }} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{m.description}</div>
                <div className="text-[10px] flex items-center gap-2 mt-0.5" style={{ color: 'var(--text-3)' }}>
                  <span>{m.mutationType}</span>
                  <span>·</span>
                  <span>{m.target}</span>
                  <span>·</span>
                  <span>{m.triggeredBy}</span>
                  <span>·</span>
                  <span>{formatTime(m.createdAt)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                background: m.status === 'confirmed' ? 'rgba(52,199,89,0.15)' : m.status === 'rolled_back' ? 'rgba(255,149,0,0.15)' : 'rgba(233,69,96,0.15)',
                color: m.status === 'confirmed' ? '#34c759' : m.status === 'rolled_back' ? '#ff9500' : '#e94560',
              }}>
                {m.status === 'pending' ? '待确认' : m.status === 'confirmed' ? '已确认' : m.status === 'rolled_back' ? '已回滚' : m.status}
              </span>
              {expanded === m.id ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-3)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-3)' }} />}
            </div>
          </button>

          {expanded === m.id && (
            <div className="px-5 pb-5 space-y-3" style={{ borderTop: '1px solid var(--surface-3)' }}>
              {/* ADL Report */}
              {m.adlReport && (
                <div className="mt-3 rounded-lg p-4" style={{ background: 'var(--surface-3)' }}>
                  <div className="text-[10px] uppercase tracking-wider font-medium mb-3" style={{ color: 'var(--text-3)' }}>
                    <Shield className="w-3 h-3 inline mr-1" /> ADL审核报告
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ADLCheck label="稳定性" check={m.adlReport.stabilityCheck} />
                    <ADLCheck label="可解释性" check={m.adlReport.explainabilityCheck} />
                    <ADLCheck label="可复用性" check={m.adlReport.reusabilityCheck} />
                    <ADLCheck label="新颖性偏差" check={m.adlReport.noveltyBiasCheck} />
                  </div>
                  <div className="mt-2 text-[11px]" style={{ color: 'var(--text-2)' }}>
                    回滚方案: {m.adlReport.rollbackPlan}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                    失败判断: {m.adlReport.failureCondition}
                  </div>
                </div>
              )}

              {/* Changes preview */}
              <div className="rounded-lg p-4" style={{ background: 'var(--surface-3)' }}>
                <div className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-3)' }}>
                  变更内容
                </div>
                <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>
                  {JSON.stringify(m.changes, null, 2)}
                </pre>
              </div>

              {/* Actions */}
              {showActions && m.status === 'pending' && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => onAction(m.id, 'confirm')}
                    disabled={acting === m.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                    style={{ background: '#34c759' }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    确认修改
                  </button>
                  <button
                    onClick={() => onAction(m.id, 'rollback')}
                    disabled={acting === m.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                    style={{ background: 'rgba(255,59,48,0.15)', color: '#ff3b30' }}
                  >
                    <Undo2 className="w-4 h-4" />
                    一键回滚
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ADLCheck({ label, check }: { label: string; check: { passed: boolean; reason: string } }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <div className={`w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 flex items-center justify-center ${check.passed ? 'bg-[#34c759]' : 'bg-[#ff3b30]'}`}>
        {check.passed
          ? <CheckCircle2 className="w-2.5 h-2.5 text-white" />
          : <AlertTriangle className="w-2.5 h-2.5 text-white" />
        }
      </div>
      <div>
        <span className="font-medium text-white">{label}</span>
        <span className="ml-1" style={{ color: 'var(--text-3)' }}>{check.reason}</span>
      </div>
    </div>
  )
}

function CandidateList({ candidates }: { candidates: Candidate[] }) {
  const statusLabels: Record<string, string> = {
    discovered: '已发现', abstracted: '已抽象', scored: '已评分',
    approved: '已通过', building: '构建中', deployed: '已部署',
    rejected: '未通过', pruned: '已修剪',
  }
  const statusColors: Record<string, string> = {
    discovered: '#8e8e93', abstracted: '#5e5ce6', scored: 'var(--brand)',
    approved: '#34c759', building: '#ff9500', deployed: '#34c759',
    rejected: '#ff3b30', pruned: '#8e8e93',
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl p-12 text-center" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
        <Zap className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <p className="text-sm text-white">暂无能力候选</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>运行PCEC周期来自动发现能力候选</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => (
        <div key={c.id} className="rounded-xl p-5" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{c.title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                background: `${statusColors[c.status] || '#8e8e93'}20`,
                color: statusColors[c.status] || '#8e8e93',
              }}>
                {statusLabels[c.status] || c.status}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                {c.source}
              </span>
            </div>
            {c.totalScore > 0 && (
              <div className="text-sm font-bold" style={{ color: c.totalScore >= 50 ? '#34c759' : '#ff9500' }}>
                VFM: {c.totalScore}
              </div>
            )}
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-2)' }}>{c.description}</p>

          {c.capabilityShape.input && c.capabilityShape.input !== '' && (
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span style={{ color: 'var(--text-3)' }}>输入: </span>
                <span style={{ color: 'var(--text-2)' }}>{c.capabilityShape.input}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)' }}>输出: </span>
                <span style={{ color: 'var(--text-2)' }}>{c.capabilityShape.output}</span>
              </div>
            </div>
          )}

          {c.vfmScore.totalWeighted > 0 && (
            <div className="space-y-1.5 mt-2">
              <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>WHY</div>
              <div className="flex items-center gap-3">
                <VFMBar label="期望匹配" value={c.vfmScore.expectationMatch} weight={4} />
                <VFMBar label="客户成长" value={c.vfmScore.clientGrowth} weight={4} />
              </div>
              <div className="text-[10px] uppercase tracking-wider font-medium mt-1" style={{ color: 'var(--text-3)' }}>HOW</div>
              <div className="flex items-center gap-3">
                <VFMBar label="速度" value={c.vfmScore.speed} weight={3} />
                <VFMBar label="简洁度" value={c.vfmScore.simplicity} weight={3} />
              </div>
              <div className="text-[10px] uppercase tracking-wider font-medium mt-1" style={{ color: 'var(--text-3)' }}>WHAT</div>
              <div className="flex items-center gap-3">
                <VFMBar label="质量" value={c.vfmScore.quality} weight={2} />
                <VFMBar label="覆盖面" value={c.vfmScore.coverage} weight={2} />
              </div>
              <div className="text-[11px] font-bold mt-1" style={{ color: c.vfmScore.totalWeighted >= 90 ? '#34c759' : c.vfmScore.totalWeighted >= 50 ? '#ff9500' : '#ff3b30' }}>
                总分: {c.vfmScore.totalWeighted} / 180
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function VFMBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label} (×{weight})</span>
        <span className="text-[10px] font-bold" style={{ color: value >= 7 ? '#34c759' : value >= 4 ? '#ff9500' : '#ff3b30' }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{
          width: `${value * 10}%`,
          background: value >= 7 ? '#34c759' : value >= 4 ? '#ff9500' : '#ff3b30',
        }} />
      </div>
    </div>
  )
}

function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const levelColors: Record<string, string> = {
    info: 'var(--brand)', warn: '#ff9500', error: '#ff3b30', evolution: '#5e5ce6', rollback: '#ff9500',
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl p-12 text-center" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
        <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <p className="text-sm text-white">暂无日志</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
      {entries.map((e, i) => (
        <div
          key={e.id}
          className="flex items-start gap-3 px-5 py-3"
          style={{ borderBottom: i < entries.length - 1 ? '1px solid var(--surface-3)' : 'none' }}
        >
          <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: levelColors[e.level] || '#8e8e93' }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white">{e.message}</div>
            <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-3)' }}>
              <span>{e.category}</span>
              <span>·</span>
              <span>{e.level}</span>
              <span>·</span>
              <span>{formatTime(e.createdAt)}</span>
              {e.mutationId && <span>· mut: {e.mutationId.substring(0, 12)}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PCECResultCard({ result, onClose }: { result: unknown; onClose: () => void }) {
  const r = result as Record<string, unknown>
  return (
    <div className="rounded-xl p-5 mb-6" style={{
      background: 'rgba(52,199,89,0.08)',
      border: '1px solid rgba(52,199,89,0.2)',
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: '#34c759' }} />
          <span className="text-sm font-semibold text-white">PCEC周期完成</span>
        </div>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--text-3)' }}>关闭</button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>发现候选</div>
          <div className="text-lg font-bold text-white">{String(r.candidatesDiscovered || 0)}</div>
        </div>
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>通过VFM</div>
          <div className="text-lg font-bold" style={{ color: '#34c759' }}>{String(r.candidatesApproved || 0)}</div>
        </div>
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>生成修改</div>
          <div className="text-lg font-bold" style={{ color: '#e94560' }}>{String(r.mutationsCreated || 0)}</div>
        </div>
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>验证完成</div>
          <div className="text-lg font-bold" style={{ color: '#5e5ce6' }}>{String(r.verificationsCompleted || 0)}</div>
        </div>
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>自动回滚</div>
          <div className="text-lg font-bold" style={{ color: Number(r.verificationsRolledBack || 0) > 0 ? '#ff9500' : 'var(--text-2)' }}>{String(r.verificationsRolledBack || 0)}</div>
        </div>
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>进化分数</div>
          <div className="text-lg font-bold" style={{ color: Number(r.evolutionScore || 0) >= 70 ? '#34c759' : Number(r.evolutionScore || 0) >= 40 ? '#ff9500' : '#ff3b30' }}>{String(r.evolutionScore || 0)}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}
