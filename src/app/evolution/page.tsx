'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dna,
  TrendingUp,
  TrendingDown,
  Activity,
  Brain,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Zap,
  GitMerge,
  GitBranch,
  Plus,
  Minus,
  Settings2,
  RefreshCw,
  Shield,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Minus as MinusIcon,
  Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

interface AgentStat {
  id: string
  nameZh: string
  nameEn: string
  category: string
  status: string
  version: string
  capabilities: string[]
  dependencies: string[]
  origin: string
  stats: {
    totalRuns: number
    successRate: number
    avgDurationMs: number
    avgTokensUsed: number
    avgQualityScore: number
    acceptRate: number
    modifyRate: number
    rejectRate: number
  }
}

interface Decision {
  id: string
  type: string
  urgency: string
  confidence: number
  targetAgents: string[]
  reasoning: string
  requiresHumanReview: boolean
  status: string
}

interface HealthReport {
  agentId: string
  stats: AgentStat['stats']
  userInteraction: { acceptRate: number; modifyRate: number; rejectRate: number; ignoreRate: number }
  trends: { qualityTrend: string; usageTrend: string; costTrend: string }
  anomalyCount: number
  anomalies: Array<{ type: string; severity: string; description: string }>
}

interface DashboardData {
  ok: boolean
  report: {
    id: string
    period: { from: string; to: string }
    generatedAt: string
    systemHealthScore: number
    executiveSummary: string
    systemInsights: string[]
    agentCount: number
    decisionCount: number
    decisions: Decision[]
    agentHealth: HealthReport[]
  } | null
  registry: {
    totalAgents: number
    byCategory: Record<string, number>
    byStatus: Record<string, number>
    agents: AgentStat[]
  }
  pendingDecisions: Decision[]
  executionPhases: Array<Array<{ id: string; nameZh: string; status: string }>>
}

// ─── Component ────────────────────────────────────────────────────────

export default function EvolutionPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [agents, setAgents] = useState<AgentStat[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'decisions' | 'pipeline'>('overview')
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, agentsRes] = await Promise.all([
        fetch('/api/evolution'),
        fetch('/api/evolution/agents'),
      ])
      const dashData = await dashRes.json()
      const agentsData = await agentsRes.json()
      setData(dashData)
      if (agentsData.ok) setAgents(agentsData.agents)
    } catch (err) {
      // Failed to fetch evolution data
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const runCycle = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/evolution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ periodDays: 7 }) })
      const result = await res.json()
      if (result.ok) {
        await fetchData()
      }
    } catch (err) {
      // Failed to run cycle
    } finally {
      setRunning(false)
    }
  }

  const handleDecision = async (decisionId: string, action: 'approve' | 'reject') => {
    try {
      await fetch('/api/evolution', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId, action }),
      })
      await fetchData()
    } catch (err) {
      // Decision action failed
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-[#c0e463]" />
      </div>
    )
  }

  const report = data?.report || null
  const registry = data?.registry || null
  const pendingDecisions = data?.pendingDecisions || []
  const phases = data?.executionPhases || []

  const tabs = [
    { key: 'overview' as const, icon: Activity, label: 'Overview' },
    { key: 'agents' as const, icon: Brain, label: 'Agent Registry' },
    { key: 'decisions' as const, icon: Zap, label: `Decisions${pendingDecisions.length > 0 ? ` (${pendingDecisions.length})` : ''}` },
    { key: 'pipeline' as const, icon: GitBranch, label: 'Pipeline' },
  ]

  return (
    <div className="p-8 max-w-[1400px] mx-auto min-h-screen" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c0e463] to-[#a8d44a] flex items-center justify-center shadow-lg">
            <Dna className="w-5 h-5" style={{ color: 'var(--brand-contrast)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>Evolution Agent</h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Observe → Diagnose → Evolve · Find the optimal solution
            </p>
          </div>
        </div>
        <button
          onClick={runCycle}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-[#c0e463] rounded-lg text-sm font-medium hover:bg-[#a8d44a] transition-colors disabled:opacity-50"
          style={{ color: 'var(--brand-contrast)' }}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {running ? 'Diagnosing...' : 'Run Diagnosis'}
        </button>
      </div>

      {/* System Health Bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          label="System Health"
          value={report ? `${report.systemHealthScore}` : '--'}
          unit="/100"
          icon={Shield}
          color={report && report.systemHealthScore >= 80 ? '#34c759' : report && report.systemHealthScore >= 50 ? '#ff9500' : '#ff3b30'}
        />
        <StatCard
          label="Active Agents"
          value={registry?.byStatus.active?.toString() || '0'}
          unit={`/${registry?.totalAgents || 0}`}
          icon={Brain}
          color="#c0e463"
        />
        <StatCard
          label="Pending Decisions"
          value={pendingDecisions.length.toString()}
          icon={Zap}
          color={pendingDecisions.length > 0 ? '#ff9500' : '#34c759'}
        />
        <StatCard
          label="Last Diagnosis"
          value={report ? formatRelativeTime(report.generatedAt) : 'Never'}
          icon={Clock}
          color="#5e5ce6"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ backgroundColor: 'var(--surface-1)' }}>
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all shadow-sm"
            style={activeTab === key
              ? { backgroundColor: 'var(--surface-1)', color: 'var(--text-1)' }
              : { color: 'var(--text-3)' }
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab report={report} agents={agents} />
      )}
      {activeTab === 'agents' && (
        <AgentsTab agents={agents} selectedAgent={selectedAgent} onSelect={setSelectedAgent} />
      )}
      {activeTab === 'decisions' && (
        <DecisionsTab
          decisions={[...(report?.decisions || []), ...pendingDecisions]}
          onAction={handleDecision}
        />
      )}
      {activeTab === 'pipeline' && (
        <PipelineTab phases={phases} agents={agents} />
      )}
    </div>
  )
}

// ─── Sub Components ───────────────────────────────────────────────────

function StatCard({ label, value, unit, icon: Icon, color }: {
  label: string; value: string; unit?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl p-4 shadow-sm border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">
        {value}
        {unit && <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function OverviewTab({ report, agents }: { report: DashboardData['report']; agents: AgentStat[] }) {
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      {report && (
        <div className="rounded-xl p-6 shadow-sm border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#c0e463]" />
            Diagnostic Summary
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>{report.executiveSummary}</p>
          {report.systemInsights && report.systemInsights.length > 0 && (
            <div className="mt-4 space-y-2">
              {report.systemInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
                  <Sparkles className="w-3.5 h-3.5 mt-0.5 text-[#5e5ce6] shrink-0" />
                  {insight}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agent Health Grid */}
      {report && report.agentHealth && report.agentHealth.length > 0 && (
        <div className="rounded-xl p-6 shadow-sm border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#c0e463]" />
            Agent Health
          </h3>
          <div className="space-y-3">
            {report.agentHealth.map((h) => {
              const agent = agents.find((a) => a.id === h.agentId)
              return (
                <div key={h.agentId} className="flex items-center gap-4 py-3 border-b border-[var(--border)] last:border-0">
                  <div className="w-32">
                    <div className="text-sm font-medium text-white">{agent?.nameEn || h.agentId}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{agent?.version}</div>
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-4 text-center">
                    <MiniMetric label="Runs" value={h.stats.totalRuns.toString()} />
                    <MiniMetric label="Success" value={`${Math.round(h.stats.successRate * 100)}%`} color={h.stats.successRate > 0.9 ? '#34c759' : '#ff9500'} />
                    <MiniMetric label="Accept" value={`${Math.round(h.userInteraction.acceptRate * 100)}%`} color={h.userInteraction.acceptRate > 0.7 ? '#34c759' : '#ff9500'} />
                    <MiniMetric label="Quality" value={h.stats.avgQualityScore.toFixed(1)} color={h.stats.avgQualityScore >= 70 ? '#34c759' : '#ff9500'} />
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendBadge trend={h.trends.qualityTrend} label="Quality" />
                    <TrendBadge trend={h.trends.usageTrend} label="Usage" />
                  </div>
                  {h.anomalyCount > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-[#ff9500] font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      {h.anomalyCount}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* No report state */}
      {!report && (
        <div className="rounded-xl p-12 shadow-sm border text-center" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <Dna className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-5)' }} />
          <h3 className="text-lg font-semibold text-white mb-2">No diagnosis yet</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
            Click "Run Diagnosis" in the top right. The Evolution Agent will analyze all agents' runtime data and generate evolution recommendations.
          </p>
        </div>
      )}
    </div>
  )
}

function AgentsTab({ agents, selectedAgent, onSelect }: {
  agents: AgentStat[]; selectedAgent: string | null; onSelect: (id: string | null) => void
}) {
  const categoryLabels: Record<string, string> = {
    business: 'Business Agents',
    meta: 'Meta Agents',
    evolution: 'Evolution Agents',
    orchestrator: 'Orchestrators',
  }

  const statusColors: Record<string, string> = {
    active: '#34c759',
    experimental: '#5e5ce6',
    degraded: '#ff9500',
    disabled: '#8e8e93',
  }

  const categories = Array.from(new Set(agents.map((a) => a.category)))

  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>
            {categoryLabels[cat] || cat}
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {agents.filter((a) => a.category === cat).map((agent) => (
              <div
                key={agent.id}
                className={`rounded-xl p-5 shadow-sm border transition-all cursor-pointer ${
                  selectedAgent === agent.id ? 'border-[#c0e463] ring-1 ring-[#c0e463]' : 'border-[var(--border)] hover:border-[var(--border)]'
                }`}
                style={{ backgroundColor: 'var(--surface-1)' }}
                onClick={() => onSelect(selectedAgent === agent.id ? null : agent.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[agent.status] || '#8e8e93' }} />
                    <div>
                      <span className="text-sm font-semibold text-white">{agent.nameEn}</span>
                      <span className="text-[10px] ml-2" style={{ color: 'var(--text-3)' }}>v{agent.version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      agent.status === 'active' ? 'bg-[rgba(52,199,89,0.1)] text-[#34c759]' :
                      agent.status === 'experimental' ? 'bg-[rgba(94,92,230,0.1)] text-[#5e5ce6]' :
                      'bg-[var(--border)] text-[var(--text-4)]'
                    }`}>
                      {agent.status}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--border)]" style={{ color: 'var(--text-3)' }}>
                      {agent.origin}
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-6 gap-4 text-center">
                  <MiniMetric label="Total Runs" value={agent.stats.totalRuns.toString()} />
                  <MiniMetric label="Success Rate" value={`${Math.round(agent.stats.successRate * 100)}%`} />
                  <MiniMetric label="Avg Duration" value={`${(agent.stats.avgDurationMs / 1000).toFixed(1)}s`} />
                  <MiniMetric label="Accept Rate" value={`${Math.round(agent.stats.acceptRate * 100)}%`} />
                  <MiniMetric label="Modify Rate" value={`${Math.round(agent.stats.modifyRate * 100)}%`} />
                  <MiniMetric label="Quality" value={agent.stats.avgQualityScore.toFixed(1)} />
                </div>

                {/* Expanded details */}
                {selectedAgent === agent.id && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="font-medium" style={{ color: 'var(--text-3)' }}>Capabilities</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.capabilities.map((c) => (
                            <span key={c} className="px-2 py-0.5 bg-[var(--border)] rounded text-[10px]" style={{ color: 'var(--text-3)' }}>{c}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: 'var(--text-3)' }}>Dependencies</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.dependencies.length > 0
                            ? agent.dependencies.map((d) => (
                                <span key={d} className="px-2 py-0.5 bg-[rgba(192,228,99,0.1)] text-[#c0e463] rounded text-[10px]">{d}</span>
                              ))
                            : <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>None</span>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DecisionsTab({ decisions, onAction }: {
  decisions: Decision[]; onAction: (id: string, action: 'approve' | 'reject') => void
}) {
  const typeIcons: Record<string, React.ElementType> = {
    enhance: ArrowUpRight,
    split: GitBranch,
    merge: GitMerge,
    create: Plus,
    deprecate: Minus,
    tune: Settings2,
  }

  const typeLabels: Record<string, string> = {
    enhance: 'Enhance',
    split: 'Split',
    merge: 'Merge',
    create: 'Create',
    deprecate: 'Deprecate',
    tune: 'Tune',
  }

  const urgencyColors: Record<string, string> = {
    immediate: '#ff3b30',
    next_sprint: '#ff9500',
    backlog: '#c0e463',
    observation: '#8e8e93',
  }

  if (decisions.length === 0) {
    return (
      <div className="rounded-xl p-12 shadow-sm border text-center" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <CheckCircle2 className="w-12 h-12 text-[#34c759] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">All systems healthy</h3>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>No pending evolution decisions.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {decisions.map((d) => {
        const Icon = typeIcons[d.type] || Zap
        return (
          <div key={d.id} className="rounded-xl p-5 shadow-sm border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--border)' }}>
                  <Icon className="w-4 h-4 text-[#c0e463]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {typeLabels[d.type] || d.type}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                      backgroundColor: `${urgencyColors[d.urgency]}15`,
                      color: urgencyColors[d.urgency],
                    }}>
                      {d.urgency}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                      Confidence {Math.round(d.confidence * 100)}%
                    </span>
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                    Target: {d.targetAgents.join(', ')}
                  </div>
                </div>
              </div>
              {d.status === 'proposed' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onAction(d.id, 'approve')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#34c759] text-white rounded-lg text-xs font-medium hover:bg-[#30b853]"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Approve
                  </button>
                  <button
                    onClick={() => onAction(d.id, 'reject')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[var(--border)] rounded-lg text-xs font-medium hover:bg-[var(--surface-1)]" style={{ color: 'var(--text-3)' }}
                  >
                    <XCircle className="w-3 h-3" />
                    Reject
                  </button>
                </div>
              )}
              {d.status !== 'proposed' && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  d.status === 'approved' || d.status === 'completed' ? 'bg-[rgba(52,199,89,0.1)] text-[#34c759]' :
                  d.status === 'rejected' ? 'bg-[rgba(255,59,48,0.1)] text-[#ff3b30]' :
                  'bg-[var(--border)] text-[var(--text-4)]'
                }`}>
                  {d.status}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed pl-11" style={{ color: 'var(--text-1)' }}>{d.reasoning}</p>
          </div>
        )
      })}
    </div>
  )
}

function PipelineTab({ phases, agents }: {
  phases: Array<Array<{ id: string; nameZh: string; status: string }>>; agents: AgentStat[]
}) {
  if (phases.length === 0) {
    return (
      <div className="rounded-xl p-12 shadow-sm border text-center" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <GitBranch className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-5)' }} />
        <h3 className="text-lg font-semibold text-white mb-2">Pipeline</h3>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Execution DAG auto-orchestrated from agent dependencies</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-6 shadow-sm border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <h3 className="text-sm font-semibold text-white mb-6 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-[#c0e463]" />
        Execution DAG (auto-orchestrated from dependencies)
      </h3>

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {phases.map((phase, pi) => (
          <div key={pi} className="flex items-center gap-4">
            <div className="min-w-[160px]">
              <div className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-3)' }}>
                Phase {pi + 1}
                {phase.length > 1 && <span className="text-[#c0e463] ml-1">parallel</span>}
              </div>
              <div className="space-y-2">
                {phase.map((agent) => {
                  const full = agents.find((a) => a.id === agent.id)
                  return (
                    <div
                      key={agent.id}
                      className="rounded-lg p-3 border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          agent.status === 'active' ? 'bg-[#34c759]' :
                          agent.status === 'experimental' ? 'bg-[#5e5ce6]' :
                          'bg-[#8e8e93]'
                        }`} />
                        <span className="text-xs font-medium text-white">{full?.nameEn || agent.nameZh}</span>
                      </div>
                      {full && (
                        <div className="text-[10px] mt-1" style={{ color: 'var(--text-4)' }}>
                          {full.stats.totalRuns > 0
                            ? `${full.stats.totalRuns} runs · ${(full.stats.avgDurationMs / 1000).toFixed(1)}s`
                            : 'No data'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {pi < phases.length - 1 && (
              <ChevronRight className="w-5 h-5 shrink-0 mt-8" style={{ color: 'var(--text-5)' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Utility Components ───────────────────────────────────────────────

function MiniMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-4)' }}>{label}</div>
      <div className="text-sm font-semibold" style={{ color: color || 'var(--text-1)' }}>{value}</div>
    </div>
  )
}

function TrendBadge({ trend, label }: { trend: string; label: string }) {
  const config: Record<string, { icon: React.ElementType; color: string }> = {
    improving: { icon: ArrowUpRight, color: '#34c759' },
    growing: { icon: ArrowUpRight, color: '#34c759' },
    decreasing: { icon: ArrowDownRight, color: '#34c759' },
    stable: { icon: MinusIcon, color: '#8e8e93' },
    degrading: { icon: ArrowDownRight, color: '#ff3b30' },
    declining: { icon: ArrowDownRight, color: '#ff9500' },
    increasing: { icon: ArrowUpRight, color: '#ff9500' },
  }

  const c = config[trend] || config.stable
  const Icon = c.icon

  return (
    <div className="flex items-center gap-0.5 text-[10px]" style={{ color: c.color }}>
      <Icon className="w-3 h-3" />
      {label}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
