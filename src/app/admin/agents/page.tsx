'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Brain,
  Activity,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Zap,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
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

interface AgentDetail extends AgentStat {
  systemPrompt?: string
  tools?: string[]
  recentLogs?: Array<{
    id: string
    run_id: string
    created_at: string
    metrics: { durationMs: number; tokensUsed: number; qualityScore: number; success: boolean }
    user_action: string | null
  }>
}

// ─── Component ────────────────────────────────────────────────────────

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentStat[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/evolution/agents')
      const data = await res.json()
      if (data.ok) setAgents(data.agents)
    } catch (err) {
      // Failed to fetch agents
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const fetchDetail = useCallback(async (agentId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/evolution/agents?id=${agentId}`)
      const data = await res.json()
      if (data.ok) setDetail(data.agent)
    } catch (err) {
      // Failed to fetch agent detail
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleSelect = (agentId: string) => {
    if (selectedAgent === agentId) {
      setSelectedAgent(null)
      setDetail(null)
    } else {
      setSelectedAgent(agentId)
      fetchDetail(agentId)
    }
  }

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

  const categories = Array.from(new Set(agents.map((a: AgentStat) => a.category)))

  const filtered = agents.filter((a: AgentStat) => {
    if (filterCategory !== 'all' && a.category !== filterCategory) return false
    if (filterStatus !== 'all' && a.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return a.nameZh.includes(q) || a.nameEn.toLowerCase().includes(q) || a.id.includes(q)
    }
    return true
  })

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
          <Brain className="w-6 h-6" style={{ color: '#e94560' }} />
          Agent 注册表
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          共 {agents.length} 个Agent · {agents.filter((a: AgentStat) => a.status === 'active').length} 活跃
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-3)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索Agent..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
            style={{
              background: 'var(--surface-3)',
              border: '1px solid var(--border-strong)',
            }}
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none cursor-pointer"
          style={{
            background: 'var(--surface-3)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <option value="all">全部分类</option>
          {categories.map((cat: string) => (
            <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none cursor-pointer"
          style={{
            background: 'var(--surface-3)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <option value="all">全部状态</option>
          <option value="active">Active</option>
          <option value="experimental">Experimental</option>
          <option value="degraded">Degraded</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {/* Agent List */}
      <div className="space-y-3">
        {filtered.map((agent: AgentStat) => (
          <div key={agent.id}>
            <button
              onClick={() => handleSelect(agent.id)}
              className="w-full text-left rounded-xl p-5 transition-all"
              style={{
                background: selectedAgent === agent.id ? 'rgba(233,69,96,0.08)' : 'var(--surface-3)',
                border: `1px solid ${selectedAgent === agent.id ? 'rgba(233,69,96,0.3)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[agent.status] || '#8e8e93' }} />
                  <div>
                    <span className="text-sm font-semibold text-white">{agent.nameZh}</span>
                    <span className="text-[10px] ml-2" style={{ color: 'var(--text-3)' }}>
                      {agent.nameEn} · v{agent.version}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                    background: `${statusColors[agent.status]}20`,
                    color: statusColors[agent.status],
                  }}>
                    {agent.status}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                    background: 'var(--surface-3)',
                    color: 'var(--text-3)',
                  }}>
                    {categoryLabels[agent.category] || agent.category}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                    background: 'var(--surface-3)',
                    color: 'var(--text-3)',
                  }}>
                    {agent.origin}
                  </span>
                  {selectedAgent === agent.id
                    ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                    : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                  }
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-6 gap-4 text-center">
                <MiniMetric label="总运行" value={agent.stats.totalRuns.toString()} />
                <MiniMetric label="成功率" value={`${Math.round(agent.stats.successRate * 100)}%`} color={agent.stats.successRate > 0.9 ? '#34c759' : '#ff9500'} />
                <MiniMetric label="平均耗时" value={`${(agent.stats.avgDurationMs / 1000).toFixed(1)}s`} />
                <MiniMetric label="接受率" value={`${Math.round(agent.stats.acceptRate * 100)}%`} color={agent.stats.acceptRate > 0.7 ? '#34c759' : '#ff9500'} />
                <MiniMetric label="修改率" value={`${Math.round(agent.stats.modifyRate * 100)}%`} />
                <MiniMetric label="质量分" value={agent.stats.avgQualityScore.toFixed(1)} color={agent.stats.avgQualityScore >= 70 ? '#34c759' : '#ff9500'} />
              </div>
            </button>

            {/* Expanded Detail */}
            {selectedAgent === agent.id && (
              <div
                className="rounded-b-xl p-5 -mt-1 space-y-4"
                style={{
                  background: 'var(--surface-3)',
                  borderLeft: '1px solid rgba(233,69,96,0.3)',
                  borderRight: '1px solid rgba(233,69,96,0.3)',
                  borderBottom: '1px solid rgba(233,69,96,0.3)',
                }}
              >
                {detailLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#e94560' }} />
                  </div>
                ) : detail ? (
                  <>
                    {/* Capabilities & Dependencies */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
                          能力标签
                        </span>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {detail.capabilities.map((c: string) => (
                            <span key={c} className="px-2 py-0.5 rounded text-[10px]" style={{
                              background: 'var(--surface-3)',
                              color: 'var(--text-2)',
                            }}>{c}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
                          依赖
                        </span>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {detail.dependencies.length > 0
                            ? detail.dependencies.map((d: string) => (
                                <span key={d} className="px-2 py-0.5 rounded text-[10px]" style={{
                                  background: 'rgba(0,113,227,0.15)',
                                  color: 'var(--brand)',
                                }}>{d}</span>
                              ))
                            : <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>无依赖</span>
                          }
                        </div>
                      </div>
                    </div>

                    {/* Tools */}
                    {detail.tools && detail.tools.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
                          工具
                        </span>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {detail.tools.map((t: string) => (
                            <span key={t} className="px-2 py-0.5 rounded text-[10px] font-mono" style={{
                              background: 'rgba(94,92,230,0.15)',
                              color: '#5e5ce6',
                            }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent Logs */}
                    {detail.recentLogs && detail.recentLogs.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
                          最近执行记录
                        </span>
                        <div className="mt-2 space-y-1.5">
                          {detail.recentLogs.map((log) => (
                            <div
                              key={log.id}
                              className="flex items-center gap-3 py-2 px-3 rounded-lg text-xs"
                              style={{ background: 'var(--surface-3)' }}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full ${log.metrics.success ? 'bg-[#34c759]' : 'bg-[#ff3b30]'}`} />
                              <span className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
                                {log.run_id.substring(0, 8)}
                              </span>
                              <span style={{ color: 'var(--text-2)' }}>
                                {(log.metrics.durationMs / 1000).toFixed(1)}s
                              </span>
                              <span style={{ color: 'var(--text-2)' }}>
                                Q:{log.metrics.qualityScore.toFixed(0)}
                              </span>
                              {log.user_action && (
                                <span className="px-1.5 py-0.5 rounded text-[10px]" style={{
                                  background: log.user_action === 'accept' ? 'rgba(52,199,89,0.15)' : log.user_action === 'reject' ? 'rgba(255,59,48,0.15)' : 'rgba(255,149,0,0.15)',
                                  color: log.user_action === 'accept' ? '#34c759' : log.user_action === 'reject' ? '#ff3b30' : '#ff9500',
                                }}>
                                  {log.user_action}
                                </span>
                              )}
                              <span className="ml-auto text-[10px]" style={{ color: 'var(--text-3)' }}>
                                {new Date(log.created_at).toLocaleString('zh-CN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>无法加载详情</p>
                )}
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div
            className="rounded-xl p-12 text-center"
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
          >
            <Brain className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
            <p className="text-sm text-white">没有找到匹配的Agent</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Utility ──────────────────────────────────────────────────────────

function MiniMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="text-sm font-semibold" style={{ color: color || 'var(--text-1)' }}>{value}</div>
    </div>
  )
}
