'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Cpu,
  Search,
  Globe,
  TrendingUp,
  Shield,
  Zap,
  Play,
  Loader2,
  Terminal,
  Database,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Tag,
  ChevronRight,
  RefreshCw,
  Plus,
  Brain,
  BarChart3,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

type KnowledgeEntry = {
  id: string
  category: string
  vertical: string | null
  tags: string[]
  title: string
  summary: string
  sourceType: string
  sourceUrl: string | null
  confidence: number
  relevance: number
  collectedAt: string
}

type ExplorationTask = {
  id: string
  query: string
  category: string
  vertical: string | null
  priority: number
  status: string
  collector: string | null
  resultCount: number
  error: string | null
  triggeredBy: string
  runAt: string | null
  createdAt: string
}

type KnowledgeStats = {
  total: number
  byCategory: Record<string, number>
  bySource: Record<string, number>
  avgRelevance: number
  avgConfidence: number
  recentCount: number
}

type ExploreResult = {
  runId: string
  startedAt: string
  completedAt: string
  tasksProcessed: number
  tasksSucceeded: number
  tasksFailed: number
  entriesCreated: number
  log: string[]
}

// ─── Helpers ────────────────────────────────────────────────────

const categoryColors: Record<string, string> = {
  competitor: '#e94560',
  trend: '#3b82f6',
  regulation: '#f59e0b',
  best_practice: '#10b981',
  technology: '#8b5cf6',
  market_data: '#06b6d4',
}

const categoryLabels: Record<string, string> = {
  competitor: '竞品分析',
  trend: '行业趋势',
  regulation: '法规合规',
  best_practice: '最佳实践',
  technology: '技术动态',
  market_data: '市场数据',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

// ─── Component ──────────────────────────────────────────────────

export default function IntelligencePage() {
  const [tab, setTab] = useState<'dashboard' | 'knowledge' | 'explore' | 'tasks'>('dashboard')
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [tasks, setTasks] = useState<ExplorationTask[]>([])
  const [loading, setLoading] = useState(true)
  const [exploring, setExploring] = useState(false)
  const [exploreLogs, setExploreLogs] = useState<string[]>([])
  const [quickQuery, setQuickQuery] = useState('')
  const [quickCategory, setQuickCategory] = useState('trend')
  const logEndRef = useRef<HTMLDivElement>(null)

  // ─── Data Loading ───────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/intelligence?view=stats')
      const data = await res.json()
      if (data.ok) setStats(data.stats)
    } catch {}
  }, [])

  const loadKnowledge = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/intelligence?view=knowledge&limit=50')
      const data = await res.json()
      if (data.ok) setEntries(data.entries)
    } catch {}
  }, [])

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/intelligence?view=tasks')
      const data = await res.json()
      if (data.ok) setTasks(data.tasks)
    } catch {}
  }, [])

  useEffect(() => {
    Promise.all([loadStats(), loadKnowledge(), loadTasks()]).finally(() => setLoading(false))
  }, [loadStats, loadKnowledge, loadTasks])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [exploreLogs])

  // ─── Actions ────────────────────────────────────────────────

  const runFullExplore = async () => {
    setExploring(true)
    setExploreLogs(['[System] 启动完整探索周期...'])
    setTab('explore')

    try {
      const res = await fetch('/api/admin/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'explore' }),
      })
      const data = await res.json()
      if (data.ok) {
        const result = data.result as ExploreResult
        setExploreLogs(result.log)
      } else {
        setExploreLogs((prev) => [...prev, `[Error] ${data.error}`])
      }
    } catch (err) {
      setExploreLogs((prev) => [...prev, `[Error] ${(err as Error).message}`])
    }

    setExploring(false)
    loadStats()
    loadKnowledge()
    loadTasks()
  }

  const runQuickSearch = async () => {
    if (!quickQuery.trim()) return
    setExploring(true)
    setExploreLogs([`[System] 快速搜索: "${quickQuery}" [${quickCategory}]`])
    setTab('explore')

    try {
      const res = await fetch('/api/admin/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quick',
          query: quickQuery,
          category: quickCategory,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        const result = data.result
        setExploreLogs((prev) => [
          ...prev,
          `[Collect] 获取 ${result.rawContents?.length || 0} 个原始内容`,
          `[Process] 生成 ${result.entries?.length || 0} 条知识条目`,
          `[Store] 耗时 ${result.duration}ms`,
          `[Done] ✅ 搜索完成`,
        ])
      } else {
        setExploreLogs((prev) => [...prev, `[Error] ${data.error}`])
      }
    } catch (err) {
      setExploreLogs((prev) => [...prev, `[Error] ${(err as Error).message}`])
    }

    setExploring(false)
    loadStats()
    loadKnowledge()
    loadTasks()
  }

  const runGapAnalysis = async () => {
    setExploring(true)
    setExploreLogs(['[System] 运行知识缺口分析...'])

    try {
      const res = await fetch('/api/admin/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'gap_analysis' }),
      })
      const data = await res.json()
      if (data.ok) {
        setExploreLogs((prev) => [
          ...prev,
          `[Gap] 创建 ${data.tasksCreated} 个新探索任务`,
          '[Done] ✅ 缺口分析完成，任务已加入队列',
        ])
      }
    } catch (err) {
      setExploreLogs((prev) => [...prev, `[Error] ${(err as Error).message}`])
    }

    setExploring(false)
    loadTasks()
  }

  // ─── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        加载中...
      </div>
    )
  }

  const tabs = [
    { key: 'dashboard', label: '总览', icon: BarChart3 },
    { key: 'knowledge', label: '知识库', icon: Database },
    { key: 'explore', label: '探索引擎', icon: Globe },
    { key: 'tasks', label: '任务队列', icon: Clock },
  ] as const

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-white flex items-center gap-2">
            <Cpu className="w-6 h-6" style={{ color: '#e94560' }} />
            情报中心
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            自主互联网探索 · 行业知识采集 · 进化情报基础
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runGapAnalysis}
            disabled={exploring}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            style={{
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#a78bfa',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}
          >
            <Brain className="w-3.5 h-3.5" />
            缺口分析
          </button>
          <button
            onClick={runFullExplore}
            disabled={exploring}
            className="px-4 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            style={{
              background: exploring ? 'rgba(233, 69, 96, 0.1)' : 'rgba(233, 69, 96, 0.15)',
              color: '#e94560',
              border: '1px solid rgba(233, 69, 96, 0.3)',
            }}
          >
            {exploring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {exploring ? '探索中...' : '启动探索'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard label="知识总量" value={stats.total} icon={Database} color="#3b82f6" />
          <StatCard label="近24h新增" value={stats.recentCount} icon={TrendingUp} color="#10b981" />
          <StatCard label="平均相关度" value={`${(stats.avgRelevance * 100).toFixed(0)}%`} icon={Zap} color="#f59e0b" />
          <StatCard label="平均置信度" value={`${(stats.avgConfidence * 100).toFixed(0)}%`} icon={Shield} color="#8b5cf6" />
          <StatCard label="来源类型" value={Object.keys(stats.bySource).length} icon={Globe} color="#e94560" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 text-[13px] font-medium flex items-center gap-1.5 transition-colors"
            style={{
              color: tab === key ? '#e94560' : 'rgba(255,255,255,0.5)',
              borderBottom: tab === key ? '2px solid #e94560' : '2px solid transparent',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'dashboard' && <DashboardTab stats={stats} entries={entries} />}
      {tab === 'knowledge' && <KnowledgeTab entries={entries} />}
      {tab === 'explore' && (
        <ExploreTab
          logs={exploreLogs}
          exploring={exploring}
          quickQuery={quickQuery}
          setQuickQuery={setQuickQuery}
          quickCategory={quickCategory}
          setQuickCategory={setQuickCategory}
          onQuickSearch={runQuickSearch}
          logEndRef={logEndRef as React.LegacyRef<HTMLDivElement>}
        />
      )}
      {tab === 'tasks' && <TasksTab tasks={tasks} />}
    </div>
  )
}

// ─── Sub Components ─────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      </div>
      <div className="text-[20px] font-bold text-white">{value}</div>
    </div>
  )
}

function DashboardTab({ stats, entries }: { stats: KnowledgeStats | null; entries: KnowledgeEntry[] }) {
  if (!stats) return null

  return (
    <div className="space-y-4">
      {/* Category Distribution */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-[14px] font-semibold text-white mb-3">知识分类分布</h3>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(stats.byCategory).map(([cat, count]) => (
            <div key={cat} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: categoryColors[cat] || '#666' }} />
                <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {categoryLabels[cat] || cat}
                </span>
              </div>
              <span className="text-[13px] font-semibold text-white">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Entries */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-[14px] font-semibold text-white mb-3">最新情报</h3>
        <div className="space-y-2">
          {entries.slice(0, 8).map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: categoryColors[entry.category] || '#666' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-white truncate">{entry.title}</div>
                <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{entry.summary}</div>
              </div>
              <div className="text-[10px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {timeAgo(entry.collectedAt)}
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="text-center py-8 text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              知识库为空，点击"启动探索"开始采集情报
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KnowledgeTab({ entries }: { entries: KnowledgeEntry[] }) {
  const [filter, setFilter] = useState<string | null>(null)
  const filtered = filter ? entries.filter((e) => e.category === filter) : entries

  return (
    <div>
      {/* Category Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilter(null)}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
          style={{
            background: !filter ? 'rgba(233, 69, 96, 0.15)' : 'rgba(255,255,255,0.05)',
            color: !filter ? '#e94560' : 'rgba(255,255,255,0.5)',
          }}
        >
          全部
        </button>
        {Object.entries(categoryLabels).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
            style={{
              background: filter === key ? `${categoryColors[key]}22` : 'rgba(255,255,255,0.05)',
              color: filter === key ? categoryColors[key] : 'rgba(255,255,255,0.5)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Entries List */}
      <div className="space-y-2">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="rounded-xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: `${categoryColors[entry.category]}22`, color: categoryColors[entry.category] }}
                >
                  {categoryLabels[entry.category] || entry.category}
                </span>
                {entry.vertical && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                    {entry.vertical}
                  </span>
                )}
              </div>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {timeAgo(entry.collectedAt)}
              </span>
            </div>
            <h4 className="text-[13px] font-medium text-white mb-1">{entry.title}</h4>
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{entry.summary}</p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3" style={{ color: '#f59e0b' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  相关度 {(entry.relevance * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3" style={{ color: '#8b5cf6' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  置信度 {(entry.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Globe className="w-3 h-3" style={{ color: '#3b82f6' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {entry.sourceType}
                </span>
              </div>
              {entry.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  <Tag className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {entry.tags.slice(0, 3).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {filter ? '该分类下暂无数据' : '知识库为空，启动探索开始采集'}
          </div>
        )}
      </div>
    </div>
  )
}

function ExploreTab({
  logs, exploring, quickQuery, setQuickQuery, quickCategory, setQuickCategory, onQuickSearch, logEndRef,
}: {
  logs: string[]
  exploring: boolean
  quickQuery: string
  setQuickQuery: (v: string) => void
  quickCategory: string
  setQuickCategory: (v: string) => void
  onQuickSearch: () => void
  logEndRef: React.LegacyRef<HTMLDivElement>
}) {
  return (
    <div className="space-y-4">
      {/* Quick Search */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-[14px] font-semibold text-white mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" style={{ color: '#e94560' }} />
          快速探索
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onQuickSearch()}
            placeholder="输入搜索主题，如：iGaming AI creative trends 2026"
            className="flex-1 px-3 py-2 rounded-lg text-[13px] text-white placeholder:text-white/30 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <select
            value={quickCategory}
            onChange={(e) => setQuickCategory(e.target.value)}
            className="px-3 py-2 rounded-lg text-[12px] text-white outline-none appearance-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            onClick={onQuickSearch}
            disabled={exploring || !quickQuery.trim()}
            className="px-4 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1.5"
            style={{
              background: 'rgba(233, 69, 96, 0.15)',
              color: '#e94560',
              border: '1px solid rgba(233, 69, 96, 0.3)',
              opacity: exploring || !quickQuery.trim() ? 0.5 : 1,
            }}
          >
            {exploring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            搜索
          </button>
        </div>
      </div>

      {/* Live Log Console */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-2 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <Terminal className="w-3.5 h-3.5" style={{ color: '#e94560' }} />
          <span className="text-[12px] font-medium text-white">探索日志</span>
          {exploring && (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>运行中</span>
            </span>
          )}
        </div>
        <div
          className="p-4 font-mono text-[11px] leading-relaxed overflow-y-auto"
          style={{
            background: '#0a0a0f',
            height: '360px',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.2)' }}>
              等待探索任务...<br />
              使用上方搜索框进行快速探索，或点击"启动探索"运行完整周期。
            </div>
          ) : (
            logs.map((line, i) => (
              <div key={i} style={{
                color: line.includes('Error') || line.includes('❌') || line.includes('failed')
                  ? '#ef4444'
                  : line.includes('✅') || line.includes('Done')
                    ? '#10b981'
                    : line.includes('[System]')
                      ? '#e94560'
                      : line.includes('→')
                        ? 'rgba(255,255,255,0.5)'
                        : 'rgba(255,255,255,0.6)',
              }}>
                {line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}

function TasksTab({ tasks }: { tasks: ExplorationTask[] }) {
  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    running: '#3b82f6',
    completed: '#10b981',
    failed: '#ef4444',
    skipped: '#6b7280',
  }

  const statusLabels: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    skipped: '跳过',
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: statusColors[task.status] || '#666' }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-white truncate">{task.query}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px]" style={{ color: categoryColors[task.category] }}>
                {categoryLabels[task.category] || task.category}
              </span>
              {task.collector && (
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  via {task.collector}
                </span>
              )}
              {task.resultCount > 0 && (
                <span className="text-[10px]" style={{ color: '#10b981' }}>
                  {task.resultCount} 条
                </span>
              )}
            </div>
          </div>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
            style={{
              background: `${statusColors[task.status]}22`,
              color: statusColors[task.status],
            }}
          >
            {statusLabels[task.status] || task.status}
          </span>
          <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {timeAgo(task.createdAt)}
          </span>
        </div>
      ))}
      {tasks.length === 0 && (
        <div className="text-center py-12 text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          暂无探索任务
        </div>
      )}
    </div>
  )
}
