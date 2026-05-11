/**
 * Evolution Agent — Diagnostician Module
 * ========================================
 *
 * Takes health reports from the Observer and produces EvolutionDecisions.
 * This is the "brain" of the Evolution Agent — it reasons about what
 * changes should be made to the agent ecosystem.
 *
 * Decision types:
 *   - enhance:   Enhance agent capabilities (add tools, improve prompt)
 *   - split:     Split agent (specialized sub-agents for specific markets/tasks)
 *   - merge:     Merge agents (reduce redundancy, cut LLM calls)
 *   - create:    Create a brand-new agent (fill capability gaps)
 *   - deprecate: Deprecate agent (unused or consistently failing)
 *   - tune:      Fine-tune parameters (prompt wording, temperature, model selection)
 *
 * Two modes:
 *   1. Rule-based (V1) — deterministic rules from health data
 *   2. LLM-assisted (V2) — use LLM to reason about complex patterns
 */

import {
  AgentHealthReport,
  EvolutionDecision,
  EvolutionDecisionType,
  EvolutionAction,
  EvolutionReport,
  AgentAnomaly,
} from '../types'
import { agentRegistry } from '../registry'
import { CrossAgentPattern, detectCrossAgentPatterns, observeAllAgents } from './observer'
import { supabaseService } from '@/lib/db'
import { callLLM } from '@/lib/callLLM'

// ─── Configuration ────────────────────────────────────────────────────

const EVOLUTION_MODEL = process.env.EVOLUTION_MODEL || process.env.AGENT_MODEL || 'anthropic/claude-sonnet-4-6'

// Thresholds for rule-based decisions
const RULES = {
  /** If reject rate > this, propose enhancement or split */
  HIGH_REJECT_RATE: 0.3,
  /** If modify rate > this in a specific market, propose split */
  HIGH_MARKET_MODIFY_RATE: 0.6,
  /** If co-invocation rate > this, consider merge */
  HIGH_CO_INVOCATION: 0.95,
  /** If usage is declining AND quality is degrading, consider deprecation */
  DEPRECATION_DAYS_INACTIVE: 30,
  /** Minimum runs before making confident decisions */
  MIN_RUNS_FOR_CONFIDENCE: 10,
  /** Quality score below which we flag for enhancement */
  LOW_QUALITY_THRESHOLD: 60,
}

// ─── Main Diagnosis Function ──────────────────────────────────────────

/**
 * Run a full diagnostic cycle and produce an EvolutionReport.
 */
export async function runDiagnosticCycle(
  periodDays: number = 7,
): Promise<EvolutionReport> {
  const reportId = `evo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const to = new Date()
  const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)

  // Phase 1: Observe
  const healthReports = await observeAllAgents(periodDays)
  const crossPatterns = await detectCrossAgentPatterns(periodDays)

  // Phase 2: Rule-based decisions
  const ruleDecisions = generateRuleBasedDecisions(healthReports, crossPatterns)

  // Phase 3: LLM-assisted analysis (if key available and enough data)
  let llmDecisions: EvolutionDecision[] = []
  let systemInsights: string[] = []
  const totalRuns = healthReports.reduce((s, h) => s + h.stats.totalRuns, 0)

  if (process.env.OPENROUTER_API_KEY && totalRuns >= RULES.MIN_RUNS_FOR_CONFIDENCE) {
    try {
      const llmResult = await llmDiagnosis(healthReports, crossPatterns, ruleDecisions)
      llmDecisions = llmResult.decisions
      systemInsights = llmResult.insights
    } catch (err) {
      systemInsights = generateFallbackInsights(healthReports, crossPatterns)
    }
  } else {
    systemInsights = generateFallbackInsights(healthReports, crossPatterns)
  }

  // Merge and deduplicate decisions
  const allDecisions = deduplicateDecisions([...ruleDecisions, ...llmDecisions])

  // Calculate system health score
  const systemHealthScore = calculateSystemHealth(healthReports)

  // Generate executive summary
  const executiveSummary = generateExecutiveSummary(
    healthReports,
    allDecisions,
    systemHealthScore,
  )

  // Persist decisions to DB
  for (const decision of allDecisions) {
    await persistDecision(decision)
  }

  const report: EvolutionReport = {
    id: reportId,
    period: { from: from.toISOString(), to: to.toISOString() },
    generatedAt: new Date().toISOString(),
    agentHealth: healthReports,
    systemInsights,
    decisions: allDecisions,
    systemHealthScore,
    executiveSummary,
  }

  // Persist report
  await persistReport(report)

  return report
}

// ─── Rule-Based Decision Engine ───────────────────────────────────────

function generateRuleBasedDecisions(
  reports: AgentHealthReport[],
  patterns: CrossAgentPattern[],
): EvolutionDecision[] {
  const decisions: EvolutionDecision[] = []
  const now = new Date().toISOString()

  for (const report of reports) {
    const { agentId, stats, userInteraction, anomalies, trends } = report

    // Rule 1: High rejection → needs enhancement
    if (
      stats.totalRuns >= RULES.MIN_RUNS_FOR_CONFIDENCE &&
      userInteraction.rejectRate > RULES.HIGH_REJECT_RATE
    ) {
      decisions.push(makeDecision({
        type: 'enhance',
        urgency: userInteraction.rejectRate > 0.5 ? 'immediate' : 'next_sprint',
        confidence: Math.min(0.9, stats.totalRuns / 50),
        targetAgents: [agentId],
        reasoning: `User rejection rate is ${pct(userInteraction.rejectRate)}, exceeding threshold ${pct(RULES.HIGH_REJECT_RATE)}. Modification rate ${pct(userInteraction.modifyRate)} indicates output direction is generally correct but quality needs improvement.`,
        actionItems: [
          {
            type: 'update_prompt',
            target: agentId,
            description: 'Analyze rejected outputs, add negative examples and quality constraints to the system prompt',
            executed: false,
          },
        ],
        impact: {
          qualityImprovement: 15,
          costChange: 5,
          complexityChange: 0,
          riskLevel: 'low',
        },
      }))
    }

    // Rule 2: Quality degrading trend → tune
    if (trends.qualityTrend === 'degrading' && stats.totalRuns >= RULES.MIN_RUNS_FOR_CONFIDENCE) {
      decisions.push(makeDecision({
        type: 'tune',
        urgency: 'next_sprint',
        confidence: 0.7,
        targetAgents: [agentId],
        reasoning: `Quality trend is declining. Average score ${stats.avgQualityScore}, prompt or model parameters need tuning.`,
        actionItems: [
          {
            type: 'adjust_param',
            target: agentId,
            description: 'Lower temperature, add few-shot examples, or switch to a stronger model',
            executed: false,
          },
        ],
        impact: {
          qualityImprovement: 10,
          costChange: 10,
          complexityChange: 0,
          riskLevel: 'low',
        },
      }))
    }

    // Rule 3: Market-specific anomaly → split
    const marketAnomalies = anomalies.filter((a) => a.type === 'pattern_change')
    if (marketAnomalies.length >= 2) {
      decisions.push(makeDecision({
        type: 'split',
        urgency: 'backlog',
        confidence: 0.6,
        targetAgents: [agentId],
        reasoning: `Differentiated modification patterns detected across ${marketAnomalies.length} markets, recommend splitting into market-specific sub-agents. ${marketAnomalies.map((a) => a.description).join('; ')}`,
        actionItems: marketAnomalies.map((a) => ({
          type: 'create_agent' as const,
          target: agentId,
          description: `Create market-specific variant of ${agentId}: ${a.description}`,
          executed: false,
        })),
        impact: {
          qualityImprovement: 20,
          costChange: 30,
          complexityChange: 25,
          riskLevel: 'medium',
        },
      }))
    }

    // Rule 4: Critical anomalies → immediate action
    const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical')
    for (const anomaly of criticalAnomalies) {
      decisions.push(makeDecision({
        type: 'enhance',
        urgency: 'immediate',
        confidence: 0.85,
        targetAgents: [agentId],
        reasoning: `Critical anomaly detected: ${anomaly.description}`,
        actionItems: [{
          type: 'update_prompt',
          target: agentId,
          description: `Urgent fix: ${anomaly.description}`,
          executed: false,
        }],
        impact: {
          qualityImprovement: 25,
          costChange: 0,
          complexityChange: 5,
          riskLevel: 'low',
        },
      }))
    }
  }

  // Cross-agent rules
  for (const pattern of patterns) {
    // Rule 5: High co-invocation → consider merge
    if (pattern.type === 'co_invocation' && pattern.frequency > RULES.HIGH_CO_INVOCATION) {
      decisions.push(makeDecision({
        type: 'merge',
        urgency: 'backlog',
        confidence: 0.5,
        targetAgents: pattern.agents,
        reasoning: `${pattern.description}。${pattern.suggestion}`,
        actionItems: [{
          type: 'merge_agents',
          target: pattern.agents.join('+'),
          description: `Evaluate merging ${pattern.agents.join(' and ')} into a composite agent`,
          executed: false,
        }],
        impact: {
          qualityImprovement: 0,
          costChange: -20,
          complexityChange: -10,
          riskLevel: 'medium',
        },
      }))
    }

    // Rule 6: Bottleneck → optimize
    if (pattern.type === 'bottleneck') {
      decisions.push(makeDecision({
        type: 'tune',
        urgency: 'next_sprint',
        confidence: 0.75,
        targetAgents: pattern.agents,
        reasoning: `${pattern.description}`,
        actionItems: [{
          type: 'adjust_param',
          target: pattern.agents[0],
          description: pattern.suggestion,
          executed: false,
        }],
        impact: {
          qualityImprovement: 0,
          costChange: -15,
          complexityChange: 0,
          riskLevel: 'low',
        },
      }))
    }
  }

  return decisions
}

// ─── LLM-Assisted Diagnosis ──────────────────────────────────────────

async function llmDiagnosis(
  reports: AgentHealthReport[],
  patterns: CrossAgentPattern[],
  ruleDecisions: EvolutionDecision[],
): Promise<{ decisions: EvolutionDecision[]; insights: string[] }> {
  const systemSnapshot = agentRegistry.getSystemSnapshot()

  const prompt = `You are the Evolution Agent for the Moboost AI MaaS platform.
Your responsibility is to analyze operational data from the agent ecosystem, find the optimal solution (not the quickest fix), and propose evolution recommendations.

# Current Agent Registry
${JSON.stringify(systemSnapshot.agents, null, 2)}

# Agent Health Reports (Past 7 Days)
${reports.map((r) => `
## ${r.agentId}
- Total runs: ${r.stats.totalRuns}
- Success rate: ${pct(r.stats.successRate)}
- Avg duration: ${r.stats.avgDurationMs}ms
- Avg quality score: ${r.stats.avgQualityScore}
- User accept rate: ${pct(r.userInteraction.acceptRate)} / Modify rate: ${pct(r.userInteraction.modifyRate)} / Reject rate: ${pct(r.userInteraction.rejectRate)}
- Trends: quality ${r.trends.qualityTrend} / usage ${r.trends.usageTrend} / cost ${r.trends.costTrend}
- Anomalies: ${r.anomalies.length > 0 ? r.anomalies.map((a) => a.description).join('; ') : 'None'}
`).join('\n')}

# Cross-Agent Patterns
${patterns.length > 0 ? patterns.map((p) => `- [${p.type}] ${p.description}`).join('\n') : 'No notable patterns'}

# Suggestions Already Produced by the Rule Engine
${ruleDecisions.map((d) => `- [${d.type}/${d.urgency}] ${d.reasoning}`).join('\n') || 'None'}

# Your Task
1. Provide 3-5 system-level insights, analyzing the agent ecosystem from a holistic perspective
2. Supplement evolution decisions that the rule engine may have missed (especially "create" type — identifying capability gaps)
3. Each decision must have clear reasoning and actionable actionItems
4. Follow the "optimal solution, not quickest fix" principle: if a problem can be solved through a fundamental improvement, do not recommend a temporary patch

Output strict JSON:
\`\`\`json
{
  "insights": ["insight1", "insight2", ...],
  "decisions": [
    {
      "type": "enhance|split|merge|create|deprecate|tune",
      "urgency": "immediate|next_sprint|backlog|observation",
      "confidence": 0.0-1.0,
      "targetAgents": ["agent_id"],
      "reasoning": "...",
      "actionItems": [
        {"type": "update_prompt|add_tool|create_agent|...", "target": "agent_id", "description": "..."}
      ],
      "impact": {
        "qualityImprovement": 0-100,
        "costChange": -100 to 100,
        "complexityChange": -100 to 100,
        "riskLevel": "low|medium|high"
      }
    }
  ]
}
\`\`\``

  const result = await callLLM({
    model: EVOLUTION_MODEL,
    messages: [{ role: 'user', content: prompt }],
    caller: 'diagnostician',
    action: 'llm_diagnosis',
    temperature: 0.3,
    responseFormat: 'json',
  })

  const parsed = JSON.parse(result.content || '{}')

  const decisions: EvolutionDecision[] = (parsed.decisions || []).map(
    (d: Record<string, unknown>) =>
      makeDecision({
        type: d.type as EvolutionDecisionType,
        urgency: (d.urgency as EvolutionDecision['urgency']) || 'backlog',
        confidence: (d.confidence as number) || 0.5,
        targetAgents: (d.targetAgents as string[]) || [],
        reasoning: (d.reasoning as string) || '',
        actionItems: ((d.actionItems as EvolutionAction[]) || []).map((a) => ({
          ...a,
          executed: false,
        })),
        impact: (d.impact as EvolutionDecision['impact']) || {
          qualityImprovement: 0,
          costChange: 0,
          complexityChange: 0,
          riskLevel: 'medium' as const,
        },
      }),
  )

  return {
    decisions,
    insights: (parsed.insights as string[]) || [],
  }
}

// ─── Fallback Insights (no LLM) ──────────────────────────────────────

function generateFallbackInsights(
  reports: AgentHealthReport[],
  patterns: CrossAgentPattern[],
): string[] {
  const insights: string[] = []
  const totalRuns = reports.reduce((s, h) => s + h.stats.totalRuns, 0)
  const avgQuality =
    reports.length > 0
      ? reports.reduce((s, h) => s + h.stats.avgQualityScore, 0) / reports.length
      : 0

  insights.push(
    `${totalRuns} total runs across ${reports.length} active agent(s), average quality score ${avgQuality.toFixed(1)}`,
  )

  const degrading = reports.filter((r) => r.trends.qualityTrend === 'degrading')
  if (degrading.length > 0) {
    insights.push(
      `${degrading.map((r) => r.agentId).join(', ')} showing declining quality trend — needs attention`,
    )
  }

  const bottlenecks = patterns.filter((p) => p.type === 'bottleneck')
  if (bottlenecks.length > 0) {
    insights.push(
      `Pipeline bottleneck: ${bottlenecks.map((p) => p.agents[0]).join(', ')}`,
    )
  }

  if (totalRuns < RULES.MIN_RUNS_FOR_CONFIDENCE) {
    insights.push(
      `Insufficient data (${totalRuns} executions) — recommend accumulating more data before making major decisions`,
    )
  }

  return insights
}

// ─── System Health Score ──────────────────────────────────────────────

function calculateSystemHealth(reports: AgentHealthReport[]): number {
  if (reports.length === 0) return 100

  let score = 100

  for (const report of reports) {
    // Deduct for anomalies
    const criticalCount = report.anomalies.filter((a) => a.severity === 'critical').length
    const warningCount = report.anomalies.filter((a) => a.severity === 'warning').length
    score -= criticalCount * 15
    score -= warningCount * 5

    // Deduct for low quality
    if (report.stats.avgQualityScore > 0 && report.stats.avgQualityScore < 50) {
      score -= 10
    }

    // Deduct for high rejection
    if (report.userInteraction.rejectRate > 0.3) {
      score -= 10
    }

    // Deduct for degrading trends
    if (report.trends.qualityTrend === 'degrading') score -= 5
    if (report.trends.costTrend === 'increasing') score -= 3
  }

  return Math.max(0, Math.min(100, score))
}

// ─── Executive Summary ────────────────────────────────────────────────

function generateExecutiveSummary(
  reports: AgentHealthReport[],
  decisions: EvolutionDecision[],
  healthScore: number,
): string {
  const parts: string[] = []

  parts.push(`System health ${healthScore}/100.`)

  const immediateCount = decisions.filter((d) => d.urgency === 'immediate').length
  if (immediateCount > 0) {
    parts.push(` ${immediateCount} item(s) require immediate attention.`)
  }

  const totalAnomalies = reports.reduce((s, r) => s + r.anomalies.length, 0)
  if (totalAnomalies > 0) {
    parts.push(` ${totalAnomalies} anomaly(ies) detected.`)
  }

  const totalDecisions = decisions.length
  if (totalDecisions > 0) {
    const byType = decisions.reduce(
      (acc, d) => {
        acc[d.type] = (acc[d.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
    const typeSummary = Object.entries(byType)
      .map(([t, c]) => `${t}×${c}`)
      .join(', ')
    parts.push(` ${totalDecisions} evolution suggestion(s) (${typeSummary}).`)
  } else {
    parts.push(` No evolution suggestions at this time. System is running smoothly.`)
  }

  return parts.join('')
}

// ─── Decision Deduplication ───────────────────────────────────────────

function deduplicateDecisions(decisions: EvolutionDecision[]): EvolutionDecision[] {
  const seen = new Set<string>()
  const unique: EvolutionDecision[] = []

  for (const d of decisions) {
    const key = `${d.type}:${d.targetAgents.sort().join(',')}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(d)
    } else {
      // If duplicate exists, keep the one with higher confidence
      const idx = unique.findIndex(
        (u) => `${u.type}:${u.targetAgents.sort().join(',')}` === key,
      )
      if (idx >= 0 && d.confidence > unique[idx].confidence) {
        unique[idx] = d
      }
    }
  }

  return unique.sort((a, b) => {
    const urgencyOrder = { immediate: 0, next_sprint: 1, backlog: 2, observation: 3 }
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
  })
}

// ─── Persistence ──────────────────────────────────────────────────────

async function persistDecision(decision: EvolutionDecision): Promise<void> {
  try {
    const db = supabaseService()
    const { error } = await db.from('evolution_decisions').insert({
      id: decision.id,
      type: decision.type,
      urgency: decision.urgency,
      confidence: decision.confidence,
      target_agents: decision.targetAgents,
      impact: decision.impact,
      reasoning: decision.reasoning,
      action_items: decision.actionItems,
      rollback_plan: decision.rollbackPlan,
      requires_human_review: decision.requiresHumanReview,
      status: decision.status,
      created_at: decision.createdAt,
    })
    if (error) {
      console.error('[persistDecision]', error.message)
    }
  } catch (err) {
    // Persist failed silently
  }
}

async function persistReport(report: EvolutionReport): Promise<void> {
  try {
    const db = supabaseService()
    const { error } = await db.from('evolution_reports').insert({
      id: report.id,
      period_from: report.period.from,
      period_to: report.period.to,
      agent_health: report.agentHealth,
      system_insights: report.systemInsights,
      decisions: report.decisions.map((d) => d.id),
      system_health_score: report.systemHealthScore,
      executive_summary: report.executiveSummary,
      generated_at: report.generatedAt,
    })
    if (error) {
      console.error('[persistReport]', error.message)
    }
  } catch (err) {
    // Persist failed silently
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function makeDecision(
  partial: Omit<EvolutionDecision, 'id' | 'rollbackPlan' | 'requiresHumanReview' | 'status' | 'createdAt'>,
): EvolutionDecision {
  const isHighRisk = partial.impact.riskLevel === 'high' || partial.type === 'merge' || partial.type === 'create'
  return {
    id: `evd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ...partial,
    rollbackPlan: generateRollbackPlan(partial.type, partial.targetAgents),
    requiresHumanReview: isHighRisk || partial.confidence < 0.7,
    status: 'proposed',
    createdAt: new Date().toISOString(),
  }
}

function generateRollbackPlan(type: EvolutionDecisionType, targets: string[]): string {
  switch (type) {
    case 'enhance':
    case 'tune':
      return `Revert the system prompt of ${targets.join(', ')} to the pre-change version`
    case 'split':
      return `Disable newly created sub-agents, restore original ${targets.join(', ')} agent`
    case 'merge':
      return `Restore merged ${targets.join(', ')} as independent agents, disable the merged agent`
    case 'create':
      return `Disable the newly created agent and remove it from the registry`
    case 'deprecate':
      return `Re-enable ${targets.join(', ')} and restore to active status`
    default:
      return `Manually evaluate and revert changes`
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// ─── Public API for Decision Management ───────────────────────────────

export async function approveDecision(decisionId: string, by: 'auto' | 'human'): Promise<void> {
  const db = supabaseService()
  const { error } = await db.from('evolution_decisions').update({
    status: 'approved',
    resolved_at: new Date().toISOString(),
    resolved_by: by,
  }).eq('id', decisionId)
  if (error) {
    console.error('[approveDecision]', error.message)
  }
}

export async function rejectDecision(decisionId: string): Promise<void> {
  const db = supabaseService()
  const { error } = await db.from('evolution_decisions').update({
    status: 'rejected',
    resolved_at: new Date().toISOString(),
    resolved_by: 'human',
  }).eq('id', decisionId)
  if (error) {
    console.error('[rejectDecision]', error.message)
  }
}

export async function getPendingDecisions(): Promise<EvolutionDecision[]> {
  const db = supabaseService()
  const { data, error } = await db
    .from('evolution_decisions')
    .select('*')
    .eq('status', 'proposed')
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: row.type as EvolutionDecisionType,
    urgency: row.urgency as EvolutionDecision['urgency'],
    confidence: row.confidence as number,
    targetAgents: row.target_agents as string[],
    impact: row.impact as EvolutionDecision['impact'],
    reasoning: row.reasoning as string,
    actionItems: row.action_items as EvolutionAction[],
    rollbackPlan: row.rollback_plan as string,
    requiresHumanReview: row.requires_human_review as boolean,
    status: row.status as EvolutionDecision['status'],
    createdAt: row.created_at as string,
    resolvedAt: row.resolved_at as string | undefined,
    resolvedBy: row.resolved_by as 'auto' | 'human' | undefined,
  }))
}

export async function getLatestReport(): Promise<EvolutionReport | null> {
  const db = supabaseService()
  const { data, error } = await db
    .from('evolution_reports')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null

  const row = data[0]
  return {
    id: row.id,
    period: { from: row.period_from, to: row.period_to },
    generatedAt: row.generated_at,
    agentHealth: row.agent_health || [],
    systemInsights: row.system_insights || [],
    decisions: [], // Would need to join with evolution_decisions
    systemHealthScore: row.system_health_score || 0,
    executiveSummary: row.executive_summary || '',
  }
}
