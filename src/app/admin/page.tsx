'use client'

import { useState, useEffect } from 'react'
import {
  Activity,
  Brain,
  Dna,
  Database,
  Users,
  Zap,
  TrendingUp,
  Shield,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

interface DashboardData {
  registry?: {
    totalAgents: number
    byCategory: Record<string, number>
    byStatus: Record<string, number>
  }
  pendingDecisions?: Array<{ id: string; type: string; urgency: string; reasoning: string }>
  report?: {
    systemHealthScore: number
    executiveSummary: string
    generatedAt: string
  } | null
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/evolution')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e94560' }} />
      </div>
    )
  }

  const registry = data.registry
  const report = data.report
  const pending = data.pendingDecisions || []

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>管理员控制台</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          Moboost AI MaaS · Agent生态系统管理
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <AdminStatCard
          label="系统健康度"
          value={report ? `${report.systemHealthScore}` : '--'}
          unit="/100"
          icon={Shield}
          color={report && report.systemHealthScore >= 80 ? '#34c759' : '#ff9500'}
        />
        <AdminStatCard
          label="注册Agent"
          value={registry?.totalAgents?.toString() || '0'}
          icon={Brain}
          color="var(--brand)"
        />
        <AdminStatCard
          label="待处理决策"
          value={pending.length.toString()}
          icon={Zap}
          color={pending.length > 0 ? '#e94560' : '#34c759'}
        />
        <AdminStatCard
          label="活跃Agent"
          value={registry?.byStatus?.active?.toString() || '0'}
          icon={Activity}
          color="#5e5ce6"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <QuickActionCard
          href="/admin/evolution"
          icon={Dna}
          title="Evolution Agent"
          description="运行诊断、查看健康报告、管理进化决策"
          color="#e94560"
        />
        <QuickActionCard
          href="/admin/meta"
          icon={Brain}
          title="Meta-Agent 工厂"
          description="创建新Agent、设计数据/引擎/前端架构"
          color="var(--brand)"
        />
        <QuickActionCard
          href="/admin/agents"
          icon={Database}
          title="Agent 注册表"
          description="查看所有Agent状态、版本、能力、依赖关系"
          color="#5e5ce6"
        />
        <QuickActionCard
          href="/admin/data"
          icon={Users}
          title="数据管理"
          description="用户数据、报告、Agent执行日志"
          color="#ff9500"
        />
      </div>

      {/* Agent Distribution */}
      {registry && (
        <div
          className="rounded-xl p-6 mb-8"
          style={{
            background: 'var(--surface-3)',
            border: '1px solid var(--border)',
          }}
        >
          <h3 className="text-sm font-semibold text-[color:var(--text-1)] mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4" style={{ color: '#e94560' }} />
            Agent分布
          </h3>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(registry.byCategory).map(([cat, count]) => {
              const labels: Record<string, string> = {
                business: '业务Agent',
                meta: '元Agent',
                evolution: '进化Agent',
                orchestrator: '编排器',
              }
              return (
                <div key={cat} className="text-center">
                  <div className="text-2xl font-bold text-[color:var(--text-1)]">{count}</div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                    {labels[cat] || cat}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Latest Report Summary */}
      {report && (
        <div
          className="rounded-xl p-6"
          style={{
            background: 'var(--surface-3)',
            border: '1px solid var(--border)',
          }}
        >
          <h3 className="text-sm font-semibold text-[color:var(--text-1)] mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: '#e94560' }} />
            最近诊断报告
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {report.executiveSummary}
          </p>
          <p className="text-[10px] mt-3" style={{ color: 'var(--text-3)' }}>
            生成于 {new Date(report.generatedAt).toLocaleString('zh-CN')}
          </p>
        </div>
      )}
    </div>
  )
}

function AdminStatCard({ label, value, unit, icon: Icon, color }: {
  label: string; value: string; unit?: string; icon: React.ElementType; color: string
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-[color:var(--text-1)]">
        {value}
        {unit && <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function QuickActionCard({ href, icon: Icon, title, description, color }: {
  href: string; icon: React.ElementType; title: string; description: string; color: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl p-5 transition-all"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${color}20` }}
          >
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--text-1)]">{title}</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{description}</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity mt-2" style={{ color: 'var(--text-3)' }} />
      </div>
    </Link>
  )
}
