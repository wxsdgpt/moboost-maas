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
        <Loader2 className="w-6 h-6 animate-spin text-[#0071e3]" />
      </div>
    )
  }

  const report = data?.report || null
  const registry = data?.registry || null
  const pendingDecisions = data?.pendingDecisions || []
  const phases = data?.executionPhases || []

  const tabs = [
    { key: 'overview' as const, icon: Activity, label: '系统总览' },
    { key: 'agents' as const, icon: Brain, label: 'Agent注册表' },
    { key: 'decisions' as const, icon: Zap, label: `进化决策${pendingDecisions.length > 0 ? ` (${pendingDecisions.length})` : ''}` },
    { key: 'pipeline' as const, icon: GitBranch, label: '执行管线' },
  ]

  return (
    <div className="p-8 max-w-[1400px] mx-auto" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center shadow-lg">
            <Dna className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-black">Evolution Agent</h1>
            <p className="text-sm text-[#6f6f77]">
              观察 → 诊断 → 进化 · 找到最优解
            </p>
          </div>
        </div>
        <button
          onClick={runCycle}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-[#0071e3] text-white rounded-lg text-sm font-medium hover:bg-[#0077ED] transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {running ? '诊断中...' : '运行诊断'}
        </button>
      </div>

      {/* System Health Bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          label="系统健康度"
          value={report ? `${report.systemHealthScore}` : '--'}
          unit="/100"
          icon={Shield}
          color={report && report.systemHealthScore >= 80 ? '#34c759' : report && report.systemHealthScore >= 50 ? '#ff9500' : '#ff3b30'}
        />
        <StatCard
          label="活跃Agent"
          value={registry?.byStatus.active?.toString() || '0'}
          unit={`/${registry?.totalAgents || 0}`}
          icon={Brain}
          color="#0071e3"
        />
        <StatCard
          label="待处理决策"
          value={pendingDecisions.length.toString()}
          icon={Zap}
          color={pendingDecisions.length > 0 ? '#ff9500' : '#34c759'}
        />
        <StatCard
          label="最近诊断"
          value={report ? formatRelativeTime(report.generatedAt) : '从未'}
          icon={Clock}
          color="#5e5ce6"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#f5f5f7] p-1 rounded-lg w-fit">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all ${
              activeTab === key ? 'bg-white text-black shadow-sm' : 'text-[#6f6f77] hover:text-black'
            }`}
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
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e5e5e7]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] text-[#6f6f77] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-black">
        {value}
        {unit && <span className="text-sm font-normal text-[#6f6f77]">{unit}</span>}
      </div>
    </div>
  )
}

function OverviewTab({ report, agents }: { report: DashboardData['report']; agents: AgentStat[] }) {
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      {report && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-[#e5e5e7]">
          <h3 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#0071e3]" />
            诊断摘要
          </h3>
          <p className="text-sm text-[#1d1d1f] leading-relaxed">{report.executiveSummary}</p>
          {report.systemInsights && report.systemInsights.length > 0 && (
            <div className="mt-4 space-y-2">
              {report.systemInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-[#6f6f77]">
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
        <div className="bg-white rounded-xl p-6 shadow-sm border border-[#e5e5e7]">
          <h3 className="text-sm font-semibold text-black mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#0071e3]" />
            Agent健康状况
          </h3>
          <div className="space-y-3">
            {report.agentHealth.map((h) => {
              const agent = agents.find((a) => a.id === h.agentId)
              return (
                <div key={h.agentId} className="flex items-center gap-4 py-3 border-b border-[#f0f0f2] last:border-0">
                  <div className="w-32">
                    <div className="text-sm font-medium text-black">{agent?.nameZh || h.agentId}</div>
                    <div className="text-[10px] text-[#6f6f77]">{agent?.version}</div>
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-4 text-center">
                    <MiniMetric label="运行" value={h.stats.totalRuns.toString()} />
                    <MiniMetric label="成功率" value={`${Math.round(h.stats.successRate * 100)}%`} color={h.stats.successRate > 0.9 ? '#34c759' : '#ff9500'} />
                    <MiniMetric label="接受率" value={`${Math.round(h.userInteraction.acceptRate * 100)}%`} color={h.userInteraction.acceptRate > 0.7 ? '#34c759' : '#ff9500'} />
                    <MiniMetric label="质量" value={h.stats.avgQualityScore.toFixed(1)} color={h.stats.avgQualityScore >= 70 ? '#34c759' : '#ff9500'} />
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendBadge trend={h.trends.qualityTrend} label="质量" />
                    <TrendBadge trend={h.trends.usageTrend} label="用量" />
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
        <div className="bg-white rounded-xl p-12 shadow-sm border border-[#e5e5e7] text-center">
          <Dna className="w-12 h-12 text-[#d5d5d7] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-black mb-2">尚未运行诊断</h3>
          <p className="text-sm text-[#6f6f77] mb-4">
            点击右上角「运行诊断」按钮，Evolution Agent 将分析所有Agent的运行数据并生成进化建议。
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
    business: '业务Agent',
    meta: '元Agent',
    evolution: '进化Agent',
    orchestrator: '编排器',
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
          <h3 className="text-xs font-semibold text-[#6f6f77] uppercase tracking-wider mb-3">
            {categoryLabels[cat] || cat}
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {agents.filter((a) => a.category === cat).map((agent) => (
              <div
                key={agent.id}
                className={`bg-white rounded-xl p-5 shadow-sm border transition-all cursor-pointer ${
                  selectedAgent === agent.id ? 'border-[#0071e3] ring-1 ring-[#0071e3]' : 'border-[#e5e5e7] hover:border-[#c5c5c7]'
                }`}
                onClick={() => onSelect(selectedAgent === agent.id ? null : agent.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[agent.status] || '#8e8e93' }} />
                    <div>
                      <span className="text-sm font-semibold text-black">{agent.nameZh}</span>
                      <span className="text-[10px] text-[#6f6f77] ml-2">{agent.nameEn} · v{agent.version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      agent.status === 'active' ? 'bg-green-50 text-green-600' :
                      agent.status === 'experimental' ? 'bg-purple-50 text-purple-600' :
                      'bg-gray-50 text-gray-500'
                    }`}>
                      {agent.status}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#6f6f77]">
                      {agent.origin}
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-6 gap-4 text-center">
                  <MiniMetric label="总运行" value={agent.stats.totalRuns.toString()} />
                  <MiniMetric label="成功率" value={`${Math.round(agent.stats.successRate * 100)}%`} />
                  <MiniMetric label="平均耗时" value={`${(agent.stats.avgDurationMs / 1000).toFixed(1)}s`} />
                  <MiniMetric label="接受率" value={`${Math.round(agent.stats.acceptRate * 100)}%`} />
                  <MiniMetric label="修改率" value={`${Math.round(agent.stats.modifyRate * 100)}%`} />
                  <MiniMetric label="质量分" value={agent.stats.avgQualityScore.toFixed(1)} />
                </div>

                {/* Expanded details */}
                {selectedAgent === agent.id && (
                  <div className="mt-4 pt-4 border-t border-[#f0f0f2]">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[#6f6f77] font-medium">能力标签</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.capabilities.map((c) => (
                            <span key={c} className="px-2 py-0.5 bg-[#f5f5f7] text-[#6f6f77] rounded text-[10px]">{c}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#6f6f77] font-medium">依赖</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.dependencies.length > 0
                            ? agent.dependencies.map((d) => (
                                <span key={d} className="px-2 py-0.5 bg-blue-50 text-[#0071e3] rounded text-[10px]">{d}</span>
                              ))
                            : <span className="text-[10px] text-[#8e8e93]">无依赖</span>
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
    enhance: '增强',
    split: '分裂',
    merge: '合并',
    create: '创建',
    deprecate: '废弃',
    tune: '微调',
  }

  const urgencyColors: Record<string, string> = {
    immediate: '#ff3b30',
    next_sprint: '#ff9500',
    backlog: '#0071e3',
    observation: '#8e8e93',
  }

  if (decisions.length === 0) {
    return (
      <div className="bg-white rounded-xl p-12 shadow-sm border border-[#e5e5e7] text-center">
        <CheckCircle2 className="w-12 h-12 text-[#34c759] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-black mb-2">系统运行平稳</h3>
        <p className="text-sm text-[#6f6f77]">当前没有待处理的进化决策。</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {decisions.map((d) => {
        const Icon = typeIcons[d.type] || Zap
        return (
          <div key={d.id} className="bg-white rounded-xl p-5 shadow-sm border border-[#e5e5e7]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f5f5f7] flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[#0071e3]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-black">
                      {typeLabels[d.type] || d.type}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                      backgroundColor: `${urgencyColors[d.urgency]}15`,
                      color: urgencyColors[d.urgency],
                    }}>
                      {d.urgency}
                    </span>
                    <span className="text-[10px] text-[#8e8e93]">
                      置信度 {Math.round(d.confidence * 100)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-[#6f6f77] mt-0.5">
                    目标: {d.targetAgents.join(', ')}
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
                    批准
                  </button>
                  <button
                    onClick={() => onAction(d.id, 'reject')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#f5f5f7] text-[#6f6f77] rounded-lg text-xs font-medium hover:bg-[#e5e5e7]"
                  >
                    <XCircle className="w-3 h-3" />
                    驳回
                  </button>
                </div>
              )}
              {d.status !== 'proposed' && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  d.status === 'approved' || d.status === 'completed' ? 'bg-green-50 text-green-600' :
                  d.status === 'rejected' ? 'bg-red-50 text-red-500' :
                  'bg-gray-50 text-gray-500'
                }`}>
                  {d.status}
                </span>
              )}
            </div>
            <p className="text-xs text-[#1d1d1f] leading-relaxed pl-11">{d.reasoning}</p>
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
      <div className="bg-white rounded-xl p-12 shadow-sm border border-[#e5e5e7] text-center">
        <GitBranch className="w-12 h-12 text-[#d5d5d7] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-black mb-2">执行管线</h3>
        <p className="text-sm text-[#6f6f77]">基于Agent依赖关系自动编排的执行DAG</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-[#e5e5e7]">
      <h3 className="text-sm font-semibold text-black mb-6 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-[#0071e3]" />
        执行DAG（基于依赖关系自动编排）
      </h3>

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {phases.map((phase, pi) => (
          <div key={pi} className="flex items-center gap-4">
            <div className="min-w-[160px]">
              <div className="text-[10px] text-[#6f6f77] uppercase tracking-wider font-medium mb-2">
                Phase {pi + 1}
                {phase.length > 1 && <span className="text-[#0071e3] ml-1">并行</span>}
              </div>
              <div className="space-y-2">
                {phase.map((agent) => {
                  const full = agents.find((a) => a.id === agent.id)
                  return (
                    <div
                      key={agent.id}
                      className="bg-[#f5f5f7] rounded-lg p-3 border border-[#e5e5e7]"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          agent.status === 'active' ? 'bg-[#34c759]' :
                          agent.status === 'experimental' ? 'bg-[#5e5ce6]' :
                          'bg-[#8e8e93]'
                        }`} />
                        <span className="text-xs font-medium text-black">{agent.nameZh}</span>
                      </div>
                      {full && (
                        <div className="text-[10px] text-[#8e8e93] mt-1">
                          {full.stats.totalRuns > 0
                            ? `${full.stats.totalRuns}次 · ${(full.stats.avgDurationMs / 1000).toFixed(1)}s`
                            : '暂无数据'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {pi < phases.length - 1 && (
              <ChevronRight className="w-5 h-5 text-[#d5d5d7] shrink-0 mt-8" />
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
      <div className="text-[10px] text-[#8e8e93] mb-0.5">{label}</div>
      <div className="text-sm font-semibold" style={{ color: color || '#1d1d1f' }}>{value}</div>
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
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}
