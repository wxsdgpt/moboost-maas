/**
 * Evolution Agent — Data Collector
 * ==================================
 *
 * Collects execution data from all agents into the agent_execution_logs table.
 * This is the "eyes" of the Evolution Agent — without this data, no evolution
 * decisions can be made.
 *
 * Design:
 *   - Fire-and-forget writes (never block the main pipeline)
 *   - Sanitize inputs (strip API keys, tokens, etc.)
 *   - Batch user feedback updates (accept/modify/reject come later)
 *
 * Usage:
 *   const tracker = startAgentExecution('copywriter', '1.0.0', ctx)
 *   // ... agent runs ...
 *   tracker.complete(result)
 *
 *   // Later, when user takes action:
 *   recordUserAction(logId, 'modified', { diff: '...' })
 */

import { supabaseService } from '@/lib/db'
import {
  AgentContext,
  AgentResult,
  AgentMetrics,
  AgentExecutionLog,
} from '../types'

// ─── Sanitization ─────────────────────────────────────────────────────

const SENSITIVE_KEYS = /key|token|secret|password|auth|credential/i

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(k)) {
      clean[k] = '[REDACTED]'
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = sanitize(v as Record<string, unknown>)
    } else {
      clean[k] = v
    }
  }
  return clean
}

/** Summarize context for storage (strip large payloads) */
function summarizeInput(ctx: AgentContext): Record<string, unknown> {
  return sanitize({
    runId: ctx.runId,
    briefId: ctx.briefId,
    userId: ctx.userId,
    targetMarkets: ctx.targetMarkets,
    productName: ctx.product?.name,
    productCategory: ctx.product?.category,
    upstreamAgents: Object.keys(ctx.upstreamOutputs),
    paramKeys: Object.keys(ctx.params),
    pipelineIndex: `${ctx.pipeline.currentIndex}/${ctx.pipeline.totalAgents}`,
  })
}

/** Summarize result for storage (cap output size) */
function summarizeOutput(result: AgentResult): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    status: result.status,
    summary: result.summary,
    outputKeys: Object.keys(result.outputs),
    errors: result.errors?.map((e) => ({ code: e.code, message: e.message })),
  }

  // Include outputs but cap total size to ~10KB
  const outputStr = JSON.stringify(result.outputs)
  if (outputStr.length < 10_000) {
    summary.outputs = result.outputs
  } else {
    summary.outputsTruncated = true
    summary.outputSize = outputStr.length
  }

  return summary
}

// ─── Execution Tracker ────────────────────────────────────────────────

export interface ExecutionTracker {
  /** Call when agent finishes (success or error) */
  complete(result: AgentResult): void
  /** Get the log ID for later user action recording */
  logId: string
}

/**
 * Start tracking an agent execution. Returns a tracker object.
 * Writes the initial log entry immediately (with status 'running').
 */
export function startAgentExecution(
  agentId: string,
  agentVersion: string,
  ctx: AgentContext,
): ExecutionTracker {
  const logId = `alog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const startedAt = Date.now()

  // Fire-and-forget initial write
  _writeLog({
    id: logId,
    runId: ctx.runId,
    agentId,
    agentVersion,
    briefId: ctx.briefId,
    userId: ctx.userId,
    inputSummary: summarizeInput(ctx),
    outputSummary: {},
    metrics: {
      durationMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      llmCalls: 0,
      toolCalls: 0,
      modelUsed: '',
      costEstimate: 0,
    },
    userAction: null,
    qualityScore: undefined,
    tags: [],
    createdAt: new Date().toISOString(),
  }).catch(() => {})

  return {
    logId,
    complete(result: AgentResult) {
      const durationMs = Date.now() - startedAt
      _updateLog(logId, {
        outputSummary: summarizeOutput(result),
        metrics: { ...result.metrics, durationMs },
        tags: [
          result.status,
          agentId,
          ...(ctx.targetMarkets || []),
        ],
      }).catch(() => {})
    },
  }
}

// ─── User Action Recording ────────────────────────────────────────────

/**
 * Record how the user interacted with an agent's output.
 * Called asynchronously after the pipeline completes and user takes action.
 */
export async function recordUserAction(
  logId: string,
  action: 'accepted' | 'modified' | 'rejected' | 'ignored',
  details?: { diff?: string; qualityScore?: number },
): Promise<void> {
  try {
    const db = supabaseService()
    const { error } = await db
      .from('agent_execution_logs')
      .update({
        user_action: action,
        modification_diff: details?.diff,
        quality_score: details?.qualityScore,
      })
      .eq('id', logId)
    if (error) {
      console.error('[recordUserAction]', error.message)
    }
  } catch (err) {
    // Record failed silently
  }
}

// ─── Batch Quality Scoring ────────────────────────────────────────────

/**
 * Batch update quality scores (e.g., from evaluation agent results).
 */
export async function batchUpdateQualityScores(
  updates: Array<{ logId: string; score: number }>,
): Promise<void> {
  const db = supabaseService()
  for (const { logId, score } of updates) {
    const { error } = await db
      .from('agent_execution_logs')
      .update({ quality_score: score })
      .eq('id', logId)
    if (error) {
      // Score update failed silently
    }
  }
}

// ─── DB Operations ────────────────────────────────────────────────────

async function _writeLog(log: AgentExecutionLog): Promise<void> {
  const db = supabaseService()
  const { error } = await db.from('agent_execution_logs').insert({
    id: log.id,
    run_id: log.runId,
    agent_id: log.agentId,
    agent_version: log.agentVersion,
    brief_id: log.briefId,
    user_id: log.userId,
    input_summary: log.inputSummary,
    output_summary: log.outputSummary,
    metrics: log.metrics,
    user_action: log.userAction,
    modification_diff: log.modificationDiff,
    quality_score: log.qualityScore,
    tags: log.tags,
    created_at: log.createdAt,
  })
  if (error) {
    console.error('[_writeLog]', error.message)
  }
}

async function _updateLog(
  logId: string,
  updates: Partial<{
    outputSummary: Record<string, unknown>
    metrics: AgentMetrics
    tags: string[]
  }>,
): Promise<void> {
  const db = supabaseService()
  const row: Record<string, unknown> = {}
  if (updates.outputSummary) row.output_summary = updates.outputSummary
  if (updates.metrics) row.metrics = updates.metrics
  if (updates.tags) row.tags = updates.tags

  const { error } = await db
    .from('agent_execution_logs')
    .update(row)
    .eq('id', logId)
  if (error) {
    console.error('[_updateLog]', error.message)
  }
}

// ─── Query Helpers (for Evolution Agent) ──────────────────────────────

export interface LogQueryOptions {
  agentId?: string
  userId?: string
  briefId?: string
  runId?: string
  status?: string
  from?: string  // ISO date
  to?: string    // ISO date
  limit?: number
  offset?: number
}

/**
 * Query execution logs for analysis.
 * Used by the Evolution Agent's observer module.
 */
export async function queryExecutionLogs(
  opts: LogQueryOptions,
): Promise<AgentExecutionLog[]> {
  const db = supabaseService()
  let query = db
    .from('agent_execution_logs')
    .select('*')
    .order('created_at', { ascending: false })

  if (opts.agentId) query = query.eq('agent_id', opts.agentId)
  if (opts.userId) query = query.eq('user_id', opts.userId)
  if (opts.briefId) query = query.eq('brief_id', opts.briefId)
  if (opts.runId) query = query.eq('run_id', opts.runId)
  if (opts.from) query = query.gte('created_at', opts.from)
  if (opts.to) query = query.lte('created_at', opts.to)
  if (opts.limit) query = query.limit(opts.limit)
  if (opts.offset) query = query.range(opts.offset, opts.offset + (opts.limit || 50) - 1)

  const { data, error } = await query
  if (error) {
    console.error('[queryExecutionLogs]', error.message)
    return []
  }

  return (data || []).map(mapRowToLog)
}

/**
 * Get aggregated stats for a specific agent.
 */
export async function getAgentStats(
  agentId: string,
  from?: string,
  to?: string,
): Promise<{
  totalRuns: number
  successRate: number
  avgDurationMs: number
  avgTokensUsed: number
  avgQualityScore: number
  acceptRate: number
  modifyRate: number
  rejectRate: number
}> {
  const logs = await queryExecutionLogs({
    agentId,
    from,
    to,
    limit: 1000,
  })

  if (logs.length === 0) {
    return {
      totalRuns: 0,
      successRate: 0,
      avgDurationMs: 0,
      avgTokensUsed: 0,
      avgQualityScore: 0,
      acceptRate: 0,
      modifyRate: 0,
      rejectRate: 0,
    }
  }

  const total = logs.length
  const successes = logs.filter((l) => l.metrics.durationMs > 0).length
  const withAction = logs.filter((l) => l.userAction !== null)
  const accepted = withAction.filter((l) => l.userAction === 'accepted').length
  const modified = withAction.filter((l) => l.userAction === 'modified').length
  const rejected = withAction.filter((l) => l.userAction === 'rejected').length
  const actionTotal = withAction.length || 1

  const avgDuration = logs.reduce((sum, l) => sum + l.metrics.durationMs, 0) / total
  const avgTokens =
    logs.reduce((sum, l) => sum + l.metrics.tokensIn + l.metrics.tokensOut, 0) / total
  const withScore = logs.filter((l) => l.qualityScore != null)
  const avgQuality =
    withScore.length > 0
      ? withScore.reduce((sum, l) => sum + (l.qualityScore || 0), 0) / withScore.length
      : 0

  return {
    totalRuns: total,
    successRate: successes / total,
    avgDurationMs: Math.round(avgDuration),
    avgTokensUsed: Math.round(avgTokens),
    avgQualityScore: Math.round(avgQuality * 10) / 10,
    acceptRate: accepted / actionTotal,
    modifyRate: modified / actionTotal,
    rejectRate: rejected / actionTotal,
  }
}

// ─── Row Mapper ───────────────────────────────────────────────────────

function mapRowToLog(row: Record<string, unknown>): AgentExecutionLog {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    agentId: row.agent_id as string,
    agentVersion: row.agent_version as string,
    briefId: row.brief_id as string | undefined,
    userId: row.user_id as string | undefined,
    inputSummary: (row.input_summary as Record<string, unknown>) || {},
    outputSummary: (row.output_summary as Record<string, unknown>) || {},
    metrics: (row.metrics as AgentMetrics) || {
      durationMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      llmCalls: 0,
      toolCalls: 0,
      modelUsed: '',
      costEstimate: 0,
    },
    userAction: row.user_action as AgentExecutionLog['userAction'],
    modificationDiff: row.modification_diff as string | undefined,
    qualityScore: row.quality_score as number | undefined,
    tags: (row.tags as string[]) || [],
    createdAt: row.created_at as string,
  }
}
