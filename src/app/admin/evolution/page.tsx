'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dna,
  TrendingUp,
  Activity,
  Brain,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Zap,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Minus as MinusIcon,
  Loader2,
  Play,
  RotateCcw,
  Target,
  Gauge,
  Eye,
  BarChart3,
  FileText,
  Terminal,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

interface PCECResult {
  cycleId: string
  startedAt: string
  completedAt: string
  candidatesDiscovered: number
  candidatesAbstracted: number
  candidatesScored: number
  candidatesApproved: number
  mutationsCreated: number
  verificationsCompleted: number
  verificationsRolledBack: number
  evolutionScore: number
  diagnosticReport: unknown
  wasForceBreakthrough: boolean
  log: string[]
}

interface PCECStatus {
  lastCycleAt: string | null
  consecutiveEmptyCycles: number
  nextForceBreakthrough: boolean
}

interface EvolutionGoal {
  id: string
  layer: 'why' | 'how' | 'what'
  name: string
  description: string
  metric: string
  currentValue: number | null
  targetValue: number
  unit: string
  direction: 'higher_better' | 'lower_better'
  weight: number
  active: boolean
}

interface Verification {
  id: string
  mutationId: string
  verdict: 'pending' | 'improved' | 'neutral' | 'degraded'
  verdictReason: string
  autoRollbackTriggered: boolean
  verifiedAt: string | null
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

type TabKey = 'pcec' | 'goals' | 'verifications' | 'log'

// ─── Component ────────────────────────────────────────────────────────

export default function AdminEvolutionPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('pcec')
  const [pcecStatus, setPcecStatus] = useState<PCECStatus | null>(null)
  const [pcecResult, setPcecResult] = useState<PCECResult | null>(null)
  const [goals, setGoals] = useState<EvolutionGoal[]>([])
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [liveLog, setLiveLog] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, goalsRes, versRes, logRes] = await Promise.all([
        fetch('/api/admin/mutations?view=pcec'),
        fetch('/api/admin/evolution?view=goals'),
        fetch('/api/admin/evolution?view=verifications'),
        fetch('/api/admin/mutations?view=changelog&limit=50&category=pcec'),
      ])
      const [statusData, goalsData, versData, logData] = await Promise.all([
        statusRes.json(), goalsRes.json(), versRes.json(), logRes.json(),
      ])
      if (statusData.ok) setPcecStatus(statusData.status)
      if (goalsData.ok) setGoals(goalsData.goals)
      if (versData.ok) setVerifications(versData.verifications)
      if (logData.ok) setChangelog(logData.entries)
    } catch (err) {
      // Fetch failed
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveLog])

  const runPCEC = async () => {
    setRunning(true)
    setPcecResult(null)
    setLiveLog(['[PCEC] 启动进化周期...'])
    setActiveTab('pcec')

    try {
      const res = await fetch('/api/admin/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pcec', periodDays: 7 }),
      })
      const data = await res.json()
      if (data.ok && data.result) {
        const result = data.result as PCECResult
        setPcecResult(result)
        setLiveLog(result.log || ['[PCEC] 周期完成'])
        await fetchData()
      } else {
        setLiveLog((prev) => [...prev, `[PCEC] ❌ 失败: ${data.error || '未知错误'}`])
      }
    } catch (err) {
      setLiveLog((prev) => [...prev, `[PCEC] ❌ 请求失败: ${(err as Error).message}`])
    } finally {
      setRunning(false)
    }
  }

  const pendingMutationCount = verifications.filter((v) => v.verdict === 'pending').length

  const tabs: Array<{ key: TabKey; icon: React.ElementType; label: string; badge?: number }> = [
    { key: 'pcec', icon: Play, label: 'PCEC引擎' },
    { key: 'goals', icon: Target, label: 'WHY/HOW/WHAT 目标' },
    { key: 'verifications', icon: Shield, label: '验证记录', badge: pendingMutationCount },
    { key: 'log', icon: Terminal, label: '进化日志' },
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
            进化中心
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            PCEC引擎 · WHY/HOW/WHAT目标 · VFM评分 · ADL校验 · 自动验证/回滚
          </p>
        </div>
        <button
          onClick={runPCEC}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{
            background: running
              ? 'rgba(233,69,96,0.4)'
              : 'linear-gradient(135deg, #e94560 0%, #c23152 100%)',
            boxShadow: running ? 'none' : '0 4px 16px rgba(233, 69, 96, 0.3)',
          }}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? 'PCEC运行中...' : '运行PCEC周期'}
        </button>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard
          label="进化分数"
          value={pcecResult?.evolutionScore?.toString() || '--'}
          unit="/100"
          icon={Gauge}
          color={pcecResult && pcecResult.evolutionScore >= 70 ? '#34c759' : pcecResult && pcecResult.evolutionScore >= 40 ? '#ff9500' : '#e94560'}
        />
        <StatCard
          label="目标覆盖"
          value={`${goals.filter((g) => g.currentValue !== null).length}/${goals.length}`}
          icon={Target}
          color="#5e5ce6"
        />
        <StatCard
          label="待验证"
          value={verifications.filter((v) => v.verdict === 'pending').length.toString()}
          icon={Eye}
          color={pendingMutationCount > 0 ? '#ff9500' : '#34c759'}
        />
        <StatCard
          label="连续空周期"
          value={pcecStatus?.consecutiveEmptyCycles?.toString() || '0'}
          icon={AlertTriangle}
          color={pcecStatus && pcecStatus.consecutiveEmptyCycles >= 2 ? '#ff3b30' : '#34c759'}
        />
        <StatCard
          label="上次运行"
          value={pcecStatus?.lastCycleAt ? formatRelativeTime(pcecStatus.lastCycleAt) : '从未'}
          icon={Clock}
          color="var(--brand)"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: 'var(--surface-3)' }}>
        {tabs.map(({ key, icon: Icon, label, badge }) => (
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
            {badge !== undefined && badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{
                background: 'rgba(233,69,96,0.4)',
              }}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'pcec' && (
        <PCECTab
          result={pcecResult}
          liveLog={liveLog}
          running={running}
          status={pcecStatus}
          logEndRef={logEndRef}
        />
      )}
      {activeTab === 'goals' && <GoalsTab goals={goals} />}
      {activeTab === 'verifications' && <VerificationsTab verifications={verifications} />}
      {activeTab === 'log' && <ChangelogTab entries={changelog} />}
    </div>
  )
}

// ─── PCEC Tab ──────────────────────────────────────────────────────────

function PCECTab({
  result, liveLog, running, status, logEndRef,
}: {
  result: PCECResult | null
  liveLog: string[]
  running: boolean
  status: PCECStatus | null
  logEndRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="space-y-4">
      {/* Result Summary */}
      {result && (
        <DarkCard>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4" style={{ color: '#34c759' }} />
            <span className="text-sm font-semibold text-white">PCEC周期完成</span>
            <span className="text-[10px] ml-auto" style={{ color: 'var(--text-3)' }}>
              {result.cycleId} · {formatRelativeTime(result.completedAt)}
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 text-center">
            <MiniStat label="发现" value={result.candidatesDiscovered} />
            <MiniStat label="抽象" value={result.candidatesAbstracted} />
            <MiniStat label="评分" value={result.candidatesScored} />
            <MiniStat label="通过" value={result.candidatesApproved} color="#34c759" />
            <MiniStat label="生成修改" value={result.mutationsCreated} color="#e94560" />
            <MiniStat label="验证" value={result.verificationsCompleted} color="#5e5ce6" />
            <MiniStat label="回滚" value={result.verificationsRolledBack} color={result.verificationsRolledBack > 0 ? '#ff9500' : undefined} />
            <MiniStat label="进化分" value={result.evolutionScore} color={result.evolutionScore >= 70 ? '#34c759' : result.evolutionScore >= 40 ? '#ff9500' : '#ff3b30'} />
          </div>
          {result.wasForceBreakthrough && (
            <div className="mt-3 text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,149,0,0.1)', color: '#ff9500' }}>
              ⚡ 本次为强制突破模式（连续空周期 ≥ 2）
            </div>
          )}
        </DarkCard>
      )}

      {/* Live Log Console */}
      <DarkCard>
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4" style={{ color: '#e94560' }} />
          <span className="text-sm font-semibold text-white">执行日志</span>
          {running && (
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-2 h-2 rounded-full bg-[#34c759] animate-pulse" />
              <span className="text-[10px]" style={{ color: '#34c759' }}>运行中</span>
            </div>
          )}
          {!running && liveLog.length > 0 && (
            <span className="text-[10px] ml-2" style={{ color: 'var(--text-3)' }}>
              {liveLog.length} 条日志
            </span>
          )}
        </div>
        <div
          className="rounded-lg p-4 font-mono text-[12px] leading-5 overflow-y-auto"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--surface-3)',
            maxHeight: '400px',
            minHeight: '200px',
          }}
        >
          {liveLog.length === 0 && !running && (
            <div style={{ color: 'var(--text-3)' }}>
              点击「运行PCEC周期」按钮启动进化流程。
              <br />
              <br />
              执行过程将实时显示在这里：
              <br />
              Phase 0: 验证上轮修改 → Phase 1: 诊断 → Phase 2: 发现候选
              <br />
              → Phase 3: 抽象 → Phase 4: VFM评分 → Phase 5: 生成修改
              <br />
              → Phase 6: 测量目标 → Phase 7: 周期汇总
            </div>
          )}
          {liveLog.map((line, i) => (
            <LogLine key={i} line={line} />
          ))}
          {running && (
            <div className="flex items-center gap-2 mt-1" style={{ color: 'var(--text-3)' }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>处理中...</span>
            </div>
          )}
          <div ref={logEndRef as React.LegacyRef<HTMLDivElement>} />
        </div>
      </DarkCard>

      {/* PCEC Status */}
      {status && (
        <DarkCard>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4" style={{ color: '#5e5ce6' }} />
            <span className="text-sm font-semibold text-white">PCEC引擎状态</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>上次运行</div>
              <div className="text-white">{status.lastCycleAt ? formatRelativeTime(status.lastCycleAt) : '从未运行'}</div>
            </div>
            <div>
              <div className="text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>连续空周期</div>
              <div className="text-white">{status.consecutiveEmptyCycles}</div>
            </div>
            <div>
              <div className="text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>下次模式</div>
              <div style={{ color: status.nextForceBreakthrough ? '#ff9500' : '#34c759' }}>
                {status.nextForceBreakthrough ? '⚡ 强制突破' : '正常探索'}
              </div>
            </div>
          </div>
        </DarkCard>
      )}
    </div>
  )
}

// ─── Goals Tab ─────────────────────────────────────────────────────────

function GoalsTab({ goals }: { goals: EvolutionGoal[] }) {
  const layers: Array<{ key: 'why' | 'how' | 'what'; label: string; color: string; desc: string }> = [
    { key: 'why', label: 'WHY — 为什么用我们', color: '#e94560', desc: '用户选择Moboost的根本原因' },
    { key: 'how', label: 'HOW — 怎么用我们', color: '#ff9500', desc: '用户与平台交互的体验质量' },
    { key: 'what', label: 'WHAT — 用哪些功能', color: '#5e5ce6', desc: '具体功能的业务成功率和覆盖' },
  ]

  if (goals.length === 0) {
    return (
      <DarkCard className="text-center py-12">
        <Target className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <p className="text-sm text-white">尚未初始化进化目标</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>运行一次PCEC周期将自动初始化9个默认目标</p>
      </DarkCard>
    )
  }

  return (
    <div className="space-y-4">
      {layers.map(({ key, label, color, desc }) => {
        const layerGoals = goals.filter((g) => g.layer === key)
        if (layerGoals.length === 0) return null
        return (
          <DarkCard key={key}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              <span className="text-sm font-semibold text-white">{label}</span>
            </div>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-3)' }}>{desc}</p>
            <div className="space-y-3">
              {layerGoals.map((goal) => (
                <GoalRow key={goal.id} goal={goal} color={color} />
              ))}
            </div>
          </DarkCard>
        )
      })}
    </div>
  )
}

function GoalRow({ goal, color }: { goal: EvolutionGoal; color: string }) {
  const hasValue = goal.currentValue !== null
  let achievement = 0
  if (hasValue) {
    if (goal.direction === 'higher_better') {
      achievement = goal.targetValue > 0 ? Math.min((goal.currentValue! / goal.targetValue) * 100, 120) : 0
    } else {
      achievement = goal.currentValue! > 0 ? Math.min((goal.targetValue / goal.currentValue!) * 100, 120) : 100
    }
  }
  const barColor = achievement >= 80 ? '#34c759' : achievement >= 50 ? '#ff9500' : '#ff3b30'

  return (
    <div className="flex items-center gap-4">
      <div className="w-[140px] shrink-0">
        <div className="text-xs font-medium text-white">{goal.name}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>
          权重 {goal.weight} · {goal.direction === 'higher_better' ? '越高越好' : '越低越好'}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            {hasValue ? `${goal.currentValue!.toFixed(2)} / ${goal.targetValue} ${goal.unit}` : '暂无数据'}
          </span>
          <span className="text-[10px] font-bold" style={{ color: hasValue ? barColor : 'var(--text-3)' }}>
            {hasValue ? `${Math.round(achievement)}%` : '--'}
          </span>
        </div>
        <div className="h-2 rounded-full" style={{ background: 'var(--surface-3)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{
            width: hasValue ? `${Math.min(achievement, 100)}%` : '0%',
            background: barColor,
          }} />
        </div>
      </div>
    </div>
  )
}

// ─── Verifications Tab ─────────────────────────────────────────────────

function VerificationsTab({ verifications }: { verifications: Verification[] }) {
  const verdictConfig: Record<string, { color: string; label: string; icon: React.ElementType }> = {
    pending: { color: '#ff9500', label: '待验证', icon: Clock },
    improved: { color: '#34c759', label: '提升', icon: ArrowUpRight },
    neutral: { color: '#8e8e93', label: '无变化', icon: MinusIcon },
    degraded: { color: '#ff3b30', label: '退化', icon: ArrowDownRight },
  }

  if (verifications.length === 0) {
    return (
      <DarkCard className="text-center py-12">
        <Shield className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <p className="text-sm text-white">暂无验证记录</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>PCEC周期会自动对mutation进行前后对比验证</p>
      </DarkCard>
    )
  }

  return (
    <div className="space-y-3">
      {verifications.map((v) => {
        const cfg = verdictConfig[v.verdict] || verdictConfig.pending
        const Icon = cfg.icon
        return (
          <DarkCard key={v.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                <div>
                  <div className="text-xs font-medium text-white flex items-center gap-2">
                    <span>{v.mutationId.substring(0, 20)}...</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                      background: `${cfg.color}20`,
                      color: cfg.color,
                    }}>
                      {cfg.label}
                    </span>
                    {v.autoRollbackTriggered && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                        background: 'rgba(255,59,48,0.15)',
                        color: '#ff3b30',
                      }}>
                        <RotateCcw className="w-3 h-3 inline mr-0.5" />
                        已自动回滚
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-2)' }}>
                    {v.verdictReason}
                  </div>
                </div>
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                {v.verifiedAt ? formatRelativeTime(v.verifiedAt) : formatRelativeTime(v.createdAt)}
              </div>
            </div>
          </DarkCard>
        )
      })}
    </div>
  )
}

// ─── Changelog Tab ─────────────────────────────────────────────────────

function ChangelogTab({ entries }: { entries: ChangelogEntry[] }) {
  const levelColors: Record<string, string> = {
    info: 'var(--brand)', warn: '#ff9500', error: '#ff3b30', evolution: '#5e5ce6', rollback: '#ff9500',
  }

  if (entries.length === 0) {
    return (
      <DarkCard className="text-center py-12">
        <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-3)' }} />
        <p className="text-sm text-white">暂无进化日志</p>
      </DarkCard>
    )
  }

  return (
    <DarkCard>
      <div className="space-y-0">
        {entries.map((e, i) => (
          <div
            key={e.id}
            className="flex items-start gap-3 py-3"
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
                <span>{formatRelativeTime(e.createdAt)}</span>
                {e.mutationId && <span>· {e.mutationId.substring(0, 12)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DarkCard>
  )
}

// ─── Log Line ──────────────────────────────────────────────────────────

function LogLine({ line }: { line: string }) {
  let color = 'var(--text-2)'
  if (line.includes('✅')) color = '#34c759'
  else if (line.includes('❌')) color = '#ff3b30'
  else if (line.includes('⚠️')) color = '#ff9500'
  else if (line.includes('↩️')) color = '#ff9500'
  else if (line.includes('Phase')) color = '#5e5ce6'
  else if (line.includes('Evolution score')) color = '#e94560'
  else if (line.includes('complete') || line.includes('完成')) color = '#34c759'

  return (
    <div style={{ color }} className="py-0.5 break-all">
      {line}
    </div>
  )
}

// ─── Shared Components ─────────────────────────────────────────────────

function StatCard({ label, value, unit, icon: Icon, color }: {
  label: string; value: string; unit?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
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

function DarkCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl p-5 ${className}`} style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: color || 'var(--text-1)' }}>{value}</div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}
