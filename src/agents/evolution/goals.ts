/**
 * Evolution Goals Framework — WHY / HOW / WHAT
 * ===============================================
 *
 * 核心目标: 在MarTech市场上生成效果最符合客户预期的产品，
 *           能够伴随每个客户不断成长的系统。
 *
 * 三层模型:
 *
 *   WHY（为什么用我们）
 *   └── 用户选择Moboost而不是其他工具的根本原因
 *       - 理解客户意图的准确度
 *       - 生成结果与客户期望的匹配度
 *       - 随使用次数增长的个性化程度
 *
 *   HOW（怎么用我们）
 *   └── 用户与平台交互的体验质量
 *       - 从brief到产出的速度
 *       - 交互轮次的简洁度（越少越好）
 *       - 修改成本（用户需要改多少才满意）
 *
 *   WHAT（用哪些功能）
 *   └── 具体功能的业务成功率和能力覆盖
 *       - 各Agent的accept rate
 *       - 信息准确性（合规、市场数据、本地化）
 *       - 能力覆盖面（支持的市场/语言/素材类型）
 *
 * 注意：系统内部成本（token数、LLM调用数）不是进化目标。
 * 用户可感知的：更高质量、更准信息、更快速度——这些才是。
 */

import { supabaseService } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────

export type GoalLayer = 'why' | 'how' | 'what'

export interface EvolutionGoal {
  id: string
  layer: GoalLayer
  name: string
  description: string
  /** How to measure this goal (metric name or formula) */
  metric: string
  /** Current measured value */
  currentValue: number | null
  /** Target value we're evolving towards */
  targetValue: number
  /** Unit of measurement */
  unit: string
  /** Higher is better? Or lower is better? */
  direction: 'higher_better' | 'lower_better'
  /** Weight in overall evolution scoring (0-10) */
  weight: number
  /** Is this goal currently active? */
  active: boolean
  updatedAt: string
}

export interface GoalVerification {
  id: string
  mutationId: string
  /** Snapshot of goal metrics BEFORE mutation was applied */
  baselineMetrics: Record<string, number>
  /** Snapshot of goal metrics AFTER mutation (measured in next PCEC) */
  postMetrics: Record<string, number> | null
  /** Did the mutation improve the goals? */
  verdict: 'improved' | 'neutral' | 'degraded' | 'pending'
  verdictReason: string
  /** If degraded, trigger auto-rollback? */
  autoRollbackTriggered: boolean
  verifiedAt: string | null
  createdAt: string
}

// ─── Default Goals ───────────────────────────────────────────────────

export const DEFAULT_GOALS: Omit<EvolutionGoal, 'id' | 'currentValue' | 'updatedAt'>[] = [
  // WHY — 为什么用我们
  {
    layer: 'why',
    name: '意图理解准确度',
    description: '用户brief被正确理解的比例。以首次生成不需要重新解释brief来衡量。',
    metric: 'intent_accuracy',
    targetValue: 0.9,
    unit: 'rate',
    direction: 'higher_better',
    weight: 10,
    active: true,
  },
  {
    layer: 'why',
    name: '期望匹配度',
    description: '生成结果与客户预期的匹配度。以accept+轻微modify（非重写）来衡量。',
    metric: 'expectation_match',
    targetValue: 0.85,
    unit: 'rate',
    direction: 'higher_better',
    weight: 10,
    active: true,
  },
  {
    layer: 'why',
    name: '客户成长性',
    description: '同一客户随使用次数增长，accept rate是否上升。衡量系统是否在学习客户偏好。',
    metric: 'client_growth_slope',
    targetValue: 0.05,
    unit: 'slope',
    direction: 'higher_better',
    weight: 8,
    active: true,
  },

  // HOW — 怎么用我们
  {
    layer: 'how',
    name: '生成速度',
    description: '从提交brief到产出结果的平均耗时。',
    metric: 'avg_generation_seconds',
    targetValue: 30,
    unit: 'seconds',
    direction: 'lower_better',
    weight: 7,
    active: true,
  },
  {
    layer: 'how',
    name: '交互轮次',
    description: '用户从开始到满意所需的平均交互轮次（clarify+modify）。',
    metric: 'avg_interaction_rounds',
    targetValue: 1.5,
    unit: 'rounds',
    direction: 'lower_better',
    weight: 8,
    active: true,
  },
  {
    layer: 'how',
    name: '修改幅度',
    description: '用户修改输出时的平均改动量。越小说明越接近预期。',
    metric: 'avg_modification_extent',
    targetValue: 0.15,
    unit: 'rate',
    direction: 'lower_better',
    weight: 7,
    active: true,
  },

  // WHAT — 用哪些功能
  {
    layer: 'what',
    name: '业务成功率',
    description: '所有Agent的加权平均accept rate。',
    metric: 'overall_accept_rate',
    targetValue: 0.8,
    unit: 'rate',
    direction: 'higher_better',
    weight: 9,
    active: true,
  },
  {
    layer: 'what',
    name: '信息准确性',
    description: '合规检查通过率 + 市场数据引用准确率。',
    metric: 'info_accuracy',
    targetValue: 0.95,
    unit: 'rate',
    direction: 'higher_better',
    weight: 9,
    active: true,
  },
  {
    layer: 'what',
    name: '能力覆盖面',
    description: '支持的市场数×语言数×素材类型数 / 目标覆盖总数。',
    metric: 'capability_coverage',
    targetValue: 0.7,
    unit: 'rate',
    direction: 'higher_better',
    weight: 5,
    active: true,
  },
]

// ─── Goal Measurement ────────────────────────────────────────────────

/**
 * Measure all active goals against current system data.
 * Returns a snapshot of current values.
 */
export async function measureGoals(): Promise<Record<string, number>> {
  const sb = supabaseService()
  const metrics: Record<string, number> = {}
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()

  // Fetch recent execution logs
  const { data: logs } = await sb
    .from('agent_execution_logs')
    .select('agent_id, metrics, user_action, created_at')
    .gte('created_at', thirtyDaysAgo)

  if (!logs || logs.length === 0) {
    return metrics
  }

  // ── WHY metrics ──

  // intent_accuracy: runs where user didn't re-submit a clarification
  // Approximation: 1 - reject rate (reject implies intent was misunderstood)
  const totalRuns = logs.length
  const rejects = logs.filter((l: Record<string, unknown>) => l.user_action === 'reject').length
  metrics.intent_accuracy = totalRuns > 0 ? 1 - (rejects / totalRuns) : 0

  // expectation_match: accept + light modify (not reject)
  const accepts = logs.filter((l: Record<string, unknown>) => l.user_action === 'accept').length
  const modifies = logs.filter((l: Record<string, unknown>) => l.user_action === 'modify').length
  metrics.expectation_match = totalRuns > 0 ? (accepts + modifies * 0.5) / totalRuns : 0

  // client_growth_slope: simplified — compare accept rate of first half vs second half
  const sorted = [...logs].sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
  )
  const mid = Math.floor(sorted.length / 2)
  if (mid > 0) {
    const firstHalf = sorted.slice(0, mid)
    const secondHalf = sorted.slice(mid)
    const firstAccept = firstHalf.filter((l: Record<string, unknown>) => l.user_action === 'accept').length / firstHalf.length
    const secondAccept = secondHalf.filter((l: Record<string, unknown>) => l.user_action === 'accept').length / secondHalf.length
    metrics.client_growth_slope = secondAccept - firstAccept
  } else {
    metrics.client_growth_slope = 0
  }

  // ── HOW metrics ──

  // avg_generation_seconds
  const durations = logs
    .map((l: Record<string, unknown>) => {
      const m = l.metrics as Record<string, unknown> | null
      return m?.durationMs as number | undefined
    })
    .filter((d): d is number => typeof d === 'number' && d > 0)

  metrics.avg_generation_seconds = durations.length > 0
    ? durations.reduce((s: number, d: number) => s + d, 0) / durations.length / 1000
    : 0

  // avg_interaction_rounds: approximate by counting logs per run_id
  const runCounts: Record<string, number> = {}
  logs.forEach((l: Record<string, unknown>) => {
    const rid = l.agent_id as string // group by agent invocations
    runCounts[rid] = (runCounts[rid] || 0) + 1
  })
  // This is a rough proxy — real implementation would track per-brief interaction rounds
  metrics.avg_interaction_rounds = 1.0 // placeholder until we have brief-level tracking

  // avg_modification_extent: ratio of modifies to total actions
  const actioned = logs.filter((l: Record<string, unknown>) => l.user_action !== null).length
  metrics.avg_modification_extent = actioned > 0 ? modifies / actioned : 0

  // ── WHAT metrics ──

  // overall_accept_rate
  metrics.overall_accept_rate = actioned > 0 ? accepts / actioned : 0

  // info_accuracy: quality scores as proxy (quality >= 80 considered accurate)
  const qualityScores = logs
    .map((l: Record<string, unknown>) => {
      const m = l.metrics as Record<string, unknown> | null
      return m?.qualityScore as number | undefined
    })
    .filter((q): q is number => typeof q === 'number')

  metrics.info_accuracy = qualityScores.length > 0
    ? qualityScores.filter((q: number) => q >= 80).length / qualityScores.length
    : 0

  // capability_coverage: count distinct agent_ids that have runs / total registered
  const activeAgentIds = new Set(logs.map((l: Record<string, unknown>) => l.agent_id as string))
  // Rough target: 10 agents (from initialAgents.ts)
  metrics.capability_coverage = activeAgentIds.size / 10

  return metrics
}

/**
 * Compute a single "evolution health" score (0-100) from goal metrics.
 * Weighted by each goal's weight and direction.
 */
export function computeEvolutionScore(
  goals: EvolutionGoal[],
  metrics: Record<string, number>,
): number {
  let totalWeight = 0
  let weightedSum = 0

  for (const goal of goals) {
    if (!goal.active) continue
    const value = metrics[goal.metric]
    if (value === undefined) continue

    totalWeight += goal.weight

    // Compute achievement ratio (0-1)
    let achievement: number
    if (goal.direction === 'higher_better') {
      achievement = goal.targetValue > 0 ? Math.min(value / goal.targetValue, 1.2) : 0
    } else {
      // Lower is better: if current <= target, we're at or above 1.0
      achievement = value > 0 ? Math.min(goal.targetValue / value, 1.2) : 1.0
    }

    weightedSum += achievement * goal.weight
  }

  if (totalWeight === 0) return 0
  return Math.round((weightedSum / totalWeight) * 100)
}

// ─── Verification ────────────────────────────────────────────────────

/**
 * Create a verification record before a mutation is applied.
 * Captures baseline metrics.
 */
export async function createVerification(mutationId: string): Promise<string> {
  const baseline = await measureGoals()
  const id = `ver_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  const sb = supabaseService()
  await sb.from('evolution_verifications').insert({
    id,
    mutation_id: mutationId,
    baseline_metrics: baseline,
    post_metrics: null,
    verdict: 'pending',
    verdict_reason: 'Awaiting post-mutation measurement',
    auto_rollback_triggered: false,
    verified_at: null,
  })

  return id
}

/**
 * Complete a verification: measure post-mutation metrics and compare.
 * If metrics degraded beyond threshold, flag for auto-rollback.
 */
export async function completeVerification(
  verificationId: string,
  goals: EvolutionGoal[],
): Promise<GoalVerification> {
  const sb = supabaseService()

  const { data: ver } = await sb
    .from('evolution_verifications')
    .select('*')
    .eq('id', verificationId)
    .single()

  if (!ver) throw new Error(`Verification ${verificationId} not found`)

  const postMetrics = await measureGoals()
  const baseline = ver.baseline_metrics as Record<string, number>

  // Compare: check if any WHY-layer goal degraded significantly
  let dominated = 0
  let improved = 0
  let total = 0
  const reasons: string[] = []

  for (const goal of goals) {
    if (!goal.active) continue
    const pre = baseline[goal.metric]
    const post = postMetrics[goal.metric]
    if (pre === undefined || post === undefined) continue

    total++
    const delta = post - pre
    const isImprovement = goal.direction === 'higher_better' ? delta > 0 : delta < 0
    const isDegradation = goal.direction === 'higher_better' ? delta < -0.05 : delta > 0.05

    if (isImprovement) {
      improved++
    } else if (isDegradation) {
      dominated++
      reasons.push(`${goal.name}: ${pre.toFixed(3)} → ${post.toFixed(3)} (${goal.direction === 'higher_better' ? '下降' : '上升'})`)
    }
  }

  let verdict: GoalVerification['verdict']
  let autoRollback = false

  if (dominated === 0 && improved > 0) {
    verdict = 'improved'
  } else if (dominated === 0) {
    verdict = 'neutral'
  } else {
    verdict = 'degraded'
    // Auto-rollback if any WHY-layer goal degraded
    const whyDegraded = reasons.some((r) =>
      goals.some((g) => g.layer === 'why' && r.startsWith(g.name))
    )
    if (whyDegraded) {
      autoRollback = true
    }
  }

  const verdictReason = verdict === 'improved'
    ? `${improved}/${total} 项指标提升`
    : verdict === 'neutral'
    ? '指标无显著变化'
    : `${dominated}/${total} 项指标退化: ${reasons.join('; ')}`

  const { error } = await sb
    .from('evolution_verifications')
    .update({
      post_metrics: postMetrics,
      verdict,
      verdict_reason: verdictReason,
      auto_rollback_triggered: autoRollback,
      verified_at: new Date().toISOString(),
    })
    .eq('id', verificationId)

  if (error) {
    // Verification update failed silently
  }

  return {
    id: verificationId,
    mutationId: ver.mutation_id,
    baselineMetrics: baseline,
    postMetrics,
    verdict,
    verdictReason,
    autoRollbackTriggered: autoRollback,
    verifiedAt: new Date().toISOString(),
    createdAt: ver.created_at,
  }
}

// ─── Persistence ─────────────────────────────────────────────────────

/**
 * Initialize default goals if they don't exist.
 */
export async function initializeGoals(): Promise<void> {
  const sb = supabaseService()
  const { data: existing } = await sb.from('evolution_goals').select('id').limit(1)

  if (existing && existing.length > 0) return

  const rows = DEFAULT_GOALS.map((g, i) => ({
    id: `goal_${g.layer}_${i}`,
    layer: g.layer,
    name: g.name,
    description: g.description,
    metric: g.metric,
    current_value: null,
    target_value: g.targetValue,
    unit: g.unit,
    direction: g.direction,
    weight: g.weight,
    active: g.active,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await sb.from('evolution_goals').insert(rows)
  if (error) {
    // Init failed silently
  }
}

/**
 * Get all active goals.
 */
export async function getActiveGoals(): Promise<EvolutionGoal[]> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('evolution_goals')
    .select('*')
    .eq('active', true)
    .order('weight', { ascending: false })

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    layer: row.layer as GoalLayer,
    name: row.name as string,
    description: row.description as string,
    metric: row.metric as string,
    currentValue: row.current_value as number | null,
    targetValue: row.target_value as number,
    unit: row.unit as string,
    direction: row.direction as 'higher_better' | 'lower_better',
    weight: row.weight as number,
    active: row.active as boolean,
    updatedAt: row.updated_at as string,
  }))
}

/**
 * Update goal current values from measured metrics.
 */
export async function updateGoalValues(metrics: Record<string, number>): Promise<void> {
  const sb = supabaseService()
  const goals = await getActiveGoals()

  for (const goal of goals) {
    const value = metrics[goal.metric]
    if (value === undefined) continue

    await sb
      .from('evolution_goals')
      .update({ current_value: value, updated_at: new Date().toISOString() })
      .eq('id', goal.id)
  }
}

/**
 * Get pending verifications (mutations not yet verified).
 */
export async function getPendingVerifications(): Promise<GoalVerification[]> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('evolution_verifications')
    .select('*')
    .eq('verdict', 'pending')
    .order('created_at', { ascending: true })

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    mutationId: row.mutation_id as string,
    baselineMetrics: row.baseline_metrics as Record<string, number>,
    postMetrics: row.post_metrics as Record<string, number> | null,
    verdict: row.verdict as GoalVerification['verdict'],
    verdictReason: row.verdict_reason as string,
    autoRollbackTriggered: row.auto_rollback_triggered as boolean,
    verifiedAt: row.verified_at as string | null,
    createdAt: row.created_at as string,
  }))
}
