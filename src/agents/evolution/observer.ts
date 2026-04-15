/**
 * Evolution Agent — Observer Module
 * ===================================
 *
 * The Observer is the "eyes" of the Evolution Agent. It:
 *   1. Queries agent execution logs from the database
 *   2. Computes per-agent health reports (stats, trends, anomalies)
 *   3. Detects cross-agent patterns (co-invocation, output dependencies)
 *   4. Produces an AgentHealthReport for each active agent
 *
 * The Observer does NOT make decisions — that's the Diagnostician's job.
 * Clean separation: Observer = data, Diagnostician = reasoning.
 */

import {
  AgentHealthReport,
  AgentAnomaly,
  TimeSeriesPoint,
  AgentExecutionLog,
} from '../types'
import { agentRegistry } from '../registry'
import { queryExecutionLogs, getAgentStats } from './collector'

// ─── Configuration ────────────────────────────────────────────────────

const DEFAULT_OBSERVATION_DAYS = 7
const ANOMALY_QUALITY_DROP_THRESHOLD = 0.15   // 15% drop = anomaly
const ANOMALY_FAILURE_BURST_THRESHOLD = 0.25  // 25% failure rate = anomaly
const ANOMALY_COST_SPIKE_THRESHOLD = 2.0      // 2x avg cost = anomaly
const MIN_DATA_POINTS = 5                     // Need at least 5 runs to detect trends

// ─── Main Observation Function ────────────────────────────────────────

/**
 * Generate health reports for all active agents in the specified period.
 */
export async function observeAllAgents(
  periodDays: number = DEFAULT_OBSERVATION_DAYS,
): Promise<AgentHealthReport[]> {
  const agents = agentRegistry.getActive()
  const to = new Date().toISOString()
  const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()

  const reports: AgentHealthReport[] = []

  for (const agent of agents) {
    try {
      const report = await observeAgent(agent.id, from, to)
      reports.push(report)
    } catch (err) {
      // Failed to observe agent
    }
  }

  return reports
}

/**
 * Generate a health report for a single agent.
 */
export async function observeAgent(
  agentId: string,
  from: string,
  to: string,
): Promise<AgentHealthReport> {
  // Fetch stats
  const stats = await getAgentStats(agentId, from, to)

  // Fetch raw logs for time series and anomaly detection
  const logs = await queryExecutionLogs({ agentId, from, to, limit: 500 })

  // Build time series (daily aggregation)
  const timeSeries = buildTimeSeries(logs)

  // Detect trends
  const trends = detectTrends(logs, timeSeries)

  // Detect anomalies
  const anomalies = detectAnomalies(logs, stats, timeSeries)

  return {
    agentId,
    period: { from, to },
    stats: {
      totalRuns: stats.totalRuns,
      successRate: stats.successRate,
      avgDurationMs: stats.avgDurationMs,
      avgTokensUsed: stats.avgTokensUsed,
      avgCostPerRun: logs.length > 0
        ? logs.reduce((sum, l) => sum + l.metrics.costEstimate, 0) / logs.length
        : 0,
      avgQualityScore: stats.avgQualityScore,
    },
    userInteraction: {
      acceptRate: stats.acceptRate,
      modifyRate: stats.modifyRate,
      rejectRate: stats.rejectRate,
      ignoreRate: 1 - stats.acceptRate - stats.modifyRate - stats.rejectRate,
    },
    trends,
    anomalies,
    timeSeries,
  }
}

// ─── Time Series Builder ──────────────────────────────────────────────

function buildTimeSeries(logs: AgentExecutionLog[]): TimeSeriesPoint[] {
  if (logs.length === 0) return []

  // Group by day
  const byDay = new Map<string, AgentExecutionLog[]>()
  for (const log of logs) {
    const day = log.createdAt.slice(0, 10) // YYYY-MM-DD
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(log)
  }

  const points: TimeSeriesPoint[] = []

  Array.from(byDay.entries()).forEach(([day, dayLogs]) => {
    // Run count
    points.push({
      timestamp: day,
      value: dayLogs.length,
      metric: 'run_count',
    })

    // Avg quality
    const withQuality = dayLogs.filter((l: AgentExecutionLog) => l.qualityScore != null)
    if (withQuality.length > 0) {
      points.push({
        timestamp: day,
        value:
          Math.round(
            (withQuality.reduce((s: number, l: AgentExecutionLog) => s + (l.qualityScore || 0), 0) / withQuality.length) * 10,
          ) / 10,
        metric: 'avg_quality',
      })
    }

    // Avg duration
    points.push({
      timestamp: day,
      value: Math.round(
        dayLogs.reduce((s: number, l: AgentExecutionLog) => s + l.metrics.durationMs, 0) / dayLogs.length,
      ),
      metric: 'avg_duration_ms',
    })

    // Avg cost
    points.push({
      timestamp: day,
      value:
        Math.round(
          (dayLogs.reduce((s: number, l: AgentExecutionLog) => s + l.metrics.costEstimate, 0) / dayLogs.length) * 1000,
        ) / 1000,
      metric: 'avg_cost',
    })

    // Accept rate
    const withAction = dayLogs.filter((l: AgentExecutionLog) => l.userAction != null)
    if (withAction.length > 0) {
      const accepted = withAction.filter((l: AgentExecutionLog) => l.userAction === 'accepted').length
      points.push({
        timestamp: day,
        value: Math.round((accepted / withAction.length) * 100),
        metric: 'accept_rate_pct',
      })
    }
  })

  return points.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

// ─── Trend Detection ──────────────────────────────────────────────────

function detectTrends(
  logs: AgentExecutionLog[],
  timeSeries: TimeSeriesPoint[],
): AgentHealthReport['trends'] {
  if (logs.length < MIN_DATA_POINTS) {
    return { qualityTrend: 'stable', usageTrend: 'stable', costTrend: 'stable' }
  }

  return {
    qualityTrend: detectMetricTrend(timeSeries, 'avg_quality') as 'improving' | 'stable' | 'degrading',
    usageTrend: detectMetricTrend(timeSeries, 'run_count') as 'growing' | 'stable' | 'declining',
    costTrend: detectMetricTrend(timeSeries, 'avg_cost') as 'decreasing' | 'stable' | 'increasing',
  }
}

function detectMetricTrend(
  timeSeries: TimeSeriesPoint[],
  metric: string,
): string {
  const points = timeSeries
    .filter((p) => p.metric === metric)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  if (points.length < 3) return 'stable'

  // Simple linear regression slope
  const n = points.length
  const xMean = (n - 1) / 2
  const yMean = points.reduce((s, p) => s + p.value, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (points[i].value - yMean)
    denominator += (i - xMean) ** 2
  }

  if (denominator === 0) return 'stable'

  const slope = numerator / denominator
  const relativeSlope = yMean !== 0 ? slope / Math.abs(yMean) : 0

  // Threshold: 10% relative change over the period = trend
  if (metric === 'avg_quality') {
    if (relativeSlope > 0.1) return 'improving'
    if (relativeSlope < -0.1) return 'degrading'
    return 'stable'
  }
  if (metric === 'run_count') {
    if (relativeSlope > 0.1) return 'growing'
    if (relativeSlope < -0.1) return 'declining'
    return 'stable'
  }
  if (metric === 'avg_cost') {
    if (relativeSlope > 0.1) return 'increasing'
    if (relativeSlope < -0.1) return 'decreasing'
    return 'stable'
  }

  return 'stable'
}

// ─── Anomaly Detection ────────────────────────────────────────────────

function detectAnomalies(
  logs: AgentExecutionLog[],
  stats: Awaited<ReturnType<typeof getAgentStats>>,
  timeSeries: TimeSeriesPoint[],
): AgentAnomaly[] {
  const anomalies: AgentAnomaly[] = []

  if (logs.length < MIN_DATA_POINTS) return anomalies

  // 1. Quality drop detection
  const qualityPoints = timeSeries
    .filter((p) => p.metric === 'avg_quality')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  if (qualityPoints.length >= 3) {
    const recentAvg = qualityPoints.slice(-2).reduce((s, p) => s + p.value, 0) / 2
    const historicalAvg =
      qualityPoints.slice(0, -2).reduce((s, p) => s + p.value, 0) /
      (qualityPoints.length - 2)

    if (historicalAvg > 0 && (historicalAvg - recentAvg) / historicalAvg > ANOMALY_QUALITY_DROP_THRESHOLD) {
      anomalies.push({
        type: 'quality_drop',
        severity: 'warning',
        description: `质量评分下降 ${Math.round(((historicalAvg - recentAvg) / historicalAvg) * 100)}%：历史均值 ${historicalAvg.toFixed(1)} → 近期 ${recentAvg.toFixed(1)}`,
        detectedAt: new Date().toISOString(),
        dataPoints: { historicalAvg, recentAvg, dropPct: ((historicalAvg - recentAvg) / historicalAvg) * 100 },
      })
    }
  }

  // 2. Failure burst detection
  if (stats.successRate < (1 - ANOMALY_FAILURE_BURST_THRESHOLD)) {
    anomalies.push({
      type: 'failure_burst',
      severity: 'critical',
      description: `失败率异常：${Math.round((1 - stats.successRate) * 100)}% 的执行失败`,
      detectedAt: new Date().toISOString(),
      dataPoints: { successRate: stats.successRate, totalRuns: stats.totalRuns },
    })
  }

  // 3. Cost spike detection
  const costPoints = timeSeries
    .filter((p) => p.metric === 'avg_cost')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  if (costPoints.length >= 3) {
    const recentCost = costPoints[costPoints.length - 1].value
    const historicalCost =
      costPoints.slice(0, -1).reduce((s, p) => s + p.value, 0) / (costPoints.length - 1)

    if (historicalCost > 0 && recentCost / historicalCost > ANOMALY_COST_SPIKE_THRESHOLD) {
      anomalies.push({
        type: 'cost_spike',
        severity: 'warning',
        description: `成本飙升 ${(recentCost / historicalCost).toFixed(1)}x：$${historicalCost.toFixed(4)} → $${recentCost.toFixed(4)}/次`,
        detectedAt: new Date().toISOString(),
        dataPoints: { historicalCost, recentCost, ratio: recentCost / historicalCost },
      })
    }
  }

  // 4. Usage shift (high rejection rate)
  if (stats.totalRuns >= MIN_DATA_POINTS && stats.rejectRate > 0.3) {
    anomalies.push({
      type: 'usage_shift',
      severity: 'warning',
      description: `用户拒绝率过高：${Math.round(stats.rejectRate * 100)}% 的产出被用户拒绝`,
      detectedAt: new Date().toISOString(),
      dataPoints: { rejectRate: stats.rejectRate, modifyRate: stats.modifyRate, acceptRate: stats.acceptRate },
    })
  }

  // 5. Pattern change: high modify rate in specific markets
  const marketGroups = groupByTag(logs, (tag) => /^[a-z]{2}$/.test(tag)) // 2-letter country codes
  for (const [market, marketLogs] of Object.entries(marketGroups)) {
    const modified = marketLogs.filter((l) => l.userAction === 'modified').length
    const total = marketLogs.filter((l) => l.userAction != null).length
    if (total >= 3 && modified / total > 0.6) {
      anomalies.push({
        type: 'pattern_change',
        severity: 'info',
        description: `市场 ${market.toUpperCase()} 的修改率为 ${Math.round((modified / total) * 100)}%，可能需要本地化专项优化`,
        detectedAt: new Date().toISOString(),
        dataPoints: { modifyRate: modified / total, sampleSize: total },
      })
    }
  }

  return anomalies
}

// ─── Cross-Agent Pattern Detection ────────────────────────────────────

export interface CrossAgentPattern {
  type: 'co_invocation' | 'output_dependency' | 'redundancy' | 'bottleneck'
  agents: string[]
  description: string
  frequency: number
  suggestion: string
}

/**
 * Detect patterns across agents (used by Diagnostician for merge/split decisions).
 */
export async function detectCrossAgentPatterns(
  periodDays: number = DEFAULT_OBSERVATION_DAYS,
): Promise<CrossAgentPattern[]> {
  const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date().toISOString()
  const allLogs = await queryExecutionLogs({ from, to, limit: 2000 })

  const patterns: CrossAgentPattern[] = []

  // Group by run_id to see which agents run together
  const byRun = new Map<string, AgentExecutionLog[]>()
  for (const log of allLogs) {
    if (!byRun.has(log.runId)) byRun.set(log.runId, [])
    byRun.get(log.runId)!.push(log)
  }

  // Co-invocation analysis
  const pairCounts = new Map<string, number>()
  Array.from(byRun.values()).forEach((runLogs) => {
    const agentIdSet = new Set<string>()
    runLogs.forEach((l: AgentExecutionLog) => agentIdSet.add(l.agentId))
    const agentIds = Array.from(agentIdSet).sort()
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const key = `${agentIds[i]}+${agentIds[j]}`
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
      }
    }
  })

  const totalRuns = byRun.size || 1
  Array.from(pairCounts.entries()).forEach(([pair, count]) => {
    const frequency = count / totalRuns
    if (frequency > 0.8) {
      const [a, b] = pair.split('+')
      patterns.push({
        type: 'co_invocation',
        agents: [a, b],
        description: `${a} 和 ${b} 在 ${Math.round(frequency * 100)}% 的执行中同时被调用`,
        frequency,
        suggestion: frequency > 0.95
          ? `考虑合并为一个复合Agent以减少LLM调用开销`
          : `频繁协作，确保数据传递接口稳定`,
      })
    }
  })

  // Bottleneck detection (agent with highest avg duration in multi-agent runs)
  const agentDurations = new Map<string, number[]>()
  Array.from(byRun.values()).forEach((runLogs) => {
    if (runLogs.length < 2) return
    for (const log of runLogs) {
      if (!agentDurations.has(log.agentId)) agentDurations.set(log.agentId, [])
      agentDurations.get(log.agentId)!.push(log.metrics.durationMs)
    }
  })

  Array.from(agentDurations.entries()).forEach(([agentId, durations]) => {
    if (durations.length < MIN_DATA_POINTS) return
    const avg = durations.reduce((s: number, d: number) => s + d, 0) / durations.length
    const allAvgs = Array.from(agentDurations.values()).map(
      (ds) => ds.reduce((s: number, d: number) => s + d, 0) / ds.length,
    )
    const globalAvg = allAvgs.reduce((s: number, a: number) => s + a, 0) / allAvgs.length

    if (avg > globalAvg * 2 && avg > 5000) {
      patterns.push({
        type: 'bottleneck',
        agents: [agentId],
        description: `${agentId} 平均耗时 ${Math.round(avg)}ms，是全局均值的 ${(avg / globalAvg).toFixed(1)}x，构成管线瓶颈`,
        frequency: 1,
        suggestion: `考虑优化prompt长度、减少tool调用次数、或使用更快的模型`,
      })
    }
  })

  return patterns
}

// ─── Helpers ──────────────────────────────────────────────────────────

function groupByTag(
  logs: AgentExecutionLog[],
  tagFilter: (tag: string) => boolean,
): Record<string, AgentExecutionLog[]> {
  const groups: Record<string, AgentExecutionLog[]> = {}
  for (const log of logs) {
    for (const tag of log.tags) {
      if (tagFilter(tag)) {
        if (!groups[tag]) groups[tag] = []
        groups[tag].push(log)
      }
    }
  }
  return groups
}
