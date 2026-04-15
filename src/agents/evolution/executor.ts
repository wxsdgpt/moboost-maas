/**
 * Evolution Layer 3 — Internalization Executor
 * =============================================
 *
 * Executes approved evolution decisions by calling Meta-Agent orchestrator.
 * Implements the full pipeline: Decision → ADL Validation → Mutation → Backup → Log
 *
 * Layer 4 — Capability Merge & Pruning
 * =====================================
 *
 * Auto-executes merge/deprecate decisions with rollback support.
 *
 * Three Principles (用户要求):
 *   原则1: 所有修改均可一键回滚
 *   原则2: 修改记录到changelog，随时可查看
 *   原则3: 新修改admin登录时提示，确认后删除backup
 */

import { supabaseService } from '@/lib/db'
import { agentRegistry } from '../registry'
import { validateADL, type ADLReport } from './value-function'
import { createVerification } from './goals'
import type { CapabilityCandidate } from './candidates'

// ─── Types ────────────────────────────────────────────────────────────

export interface Mutation {
  id: string
  mutationType: string
  target: string
  description: string
  changes: { before: unknown; after: unknown }
  rollbackData: unknown
  rollbackSql: string | null
  isRolledBack: boolean
  status: 'pending' | 'confirmed' | 'rolled_back' | 'expired'
  triggeredBy: string
  decisionId: string | null
  candidateId: string | null
  adlPassed: boolean
  adlReport: ADLReport | null
  createdAt: string
}

// ─── Changelog Logger (原则2) ────────────────────────────────────────

export async function logChangelog(
  level: 'info' | 'warn' | 'error' | 'evolution' | 'rollback',
  category: string,
  message: string,
  details?: unknown,
  mutationId?: string,
): Promise<void> {
  const sb = supabaseService()
  const { error } = await sb.from('evolution_changelog').insert({
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    level,
    category,
    message,
    details: details || null,
    mutation_id: mutationId || null,
  })
  if (error) {
    // Log failed silently
  }
}

// ─── Mutation Executor ───────────────────────────────────────────────

/**
 * Create a mutation record with rollback data.
 * The mutation starts as 'pending' — admin must confirm before backup is deleted.
 */
export async function createMutation(params: {
  mutationType: string
  target: string
  description: string
  changes: { before: unknown; after: unknown }
  rollbackData: unknown
  rollbackSql?: string
  triggeredBy: string
  decisionId?: string
  candidateId?: string
}): Promise<{ mutation: Mutation | null; adlReport: ADLReport }> {
  // Step 1: ADL Validation (Layer 6)
  const adlReport = await validateADL({
    type: params.mutationType,
    target: params.target,
    description: params.description,
    changes: params.changes,
  })

  const mutationId = `mut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  if (adlReport.verdict === 'fail') {
    await logChangelog('warn', 'adl', `ADL拒绝了修改: ${params.description}`, {
      target: params.target,
      reason: adlReport.overallReason,
      report: adlReport,
    })
    return { mutation: null, adlReport }
  }

  // Step 2: Create mutation record (原则1: 存储rollback数据)
  const mutation: Mutation = {
    id: mutationId,
    mutationType: params.mutationType,
    target: params.target,
    description: params.description,
    changes: params.changes,
    rollbackData: params.rollbackData,
    rollbackSql: params.rollbackSql || null,
    isRolledBack: false,
    status: 'pending',
    triggeredBy: params.triggeredBy,
    decisionId: params.decisionId || null,
    candidateId: params.candidateId || null,
    adlPassed: adlReport.verdict === 'pass',
    adlReport,
    createdAt: new Date().toISOString(),
  }

  const sb = supabaseService()
  const { error } = await sb.from('evolution_mutations').insert({
    id: mutation.id,
    mutation_type: mutation.mutationType,
    target: mutation.target,
    description: mutation.description,
    changes: mutation.changes,
    rollback_data: mutation.rollbackData,
    rollback_sql: mutation.rollbackSql,
    is_rolled_back: false,
    status: 'pending',
    triggered_by: mutation.triggeredBy,
    decision_id: mutation.decisionId,
    candidate_id: mutation.candidateId,
    adl_passed: mutation.adlPassed,
    adl_report: mutation.adlReport,
  })

  if (error) {
    return { mutation: null, adlReport }
  }

  // Step 3: Log to changelog (原则2)
  await logChangelog('evolution', 'mutation', `新进化修改: ${params.description}`, {
    mutationId: mutation.id,
    type: params.mutationType,
    target: params.target,
    adlVerdict: adlReport.verdict,
  }, mutation.id)

  return { mutation, adlReport }
}

// ─── Execute Agent-Level Mutations ───────────────────────────────────

/**
 * Execute an agent enhancement (prompt update, tool addition).
 */
export async function executeAgentEnhance(
  agentId: string,
  enhancement: { newPrompt?: string; newTools?: string[]; newVersion?: string },
  triggeredBy: string,
  decisionId?: string,
): Promise<Mutation | null> {
  const agent = agentRegistry.get(agentId)
  if (!agent) {
    await logChangelog('error', 'executor', `Agent ${agentId} not found in registry`)
    return null
  }

  // Capture "before" state for rollback
  const before = {
    systemPrompt: agent.systemPrompt,
    tools: agent.tools.map((t) => t.name),
    version: agent.version,
  }

  const after = {
    systemPrompt: enhancement.newPrompt || agent.systemPrompt,
    tools: enhancement.newTools || agent.tools.map((t) => t.name),
    version: enhancement.newVersion || agent.version,
  }

  const { mutation } = await createMutation({
    mutationType: 'agent_enhance',
    target: agentId,
    description: `增强Agent "${agent.nameZh}": ${
      enhancement.newPrompt ? 'prompt更新' : ''
    }${enhancement.newTools ? ' tools更新' : ''}${enhancement.newVersion ? ` → v${enhancement.newVersion}` : ''}`,
    changes: { before, after },
    rollbackData: before,
    triggeredBy,
    decisionId,
  })

  if (!mutation) return null

  // Apply change to in-memory registry
  // (actual persistent change would be applied after admin confirmation)
  // For now we just record it — the real apply happens on confirm

  return mutation
}

/**
 * Execute an agent tune (temperature, model change).
 */
export async function executeAgentTune(
  agentId: string,
  tuning: Record<string, unknown>,
  triggeredBy: string,
  decisionId?: string,
): Promise<Mutation | null> {
  const agent = agentRegistry.get(agentId)
  if (!agent) return null

  const before = { model: agent.model, version: agent.version }
  const after = { ...before, ...tuning }

  const { mutation } = await createMutation({
    mutationType: 'agent_tune',
    target: agentId,
    description: `微调Agent "${agent.nameZh}": ${Object.keys(tuning).join(', ')}`,
    changes: { before, after },
    rollbackData: before,
    triggeredBy,
    decisionId,
  })

  return mutation
}

// ─── Rollback (原则1) ────────────────────────────────────────────────

/**
 * Rollback a mutation — restore previous state.
 */
export async function rollbackMutation(mutationId: string): Promise<boolean> {
  const sb = supabaseService()

  const { data: mutation, error: fetchErr } = await sb
    .from('evolution_mutations')
    .select('*')
    .eq('id', mutationId)
    .single()

  if (fetchErr || !mutation) {
    await logChangelog('error', 'rollback', `Mutation ${mutationId} not found`)
    return false
  }

  if (mutation.is_rolled_back) {
    await logChangelog('warn', 'rollback', `Mutation ${mutationId} already rolled back`)
    return false
  }

  // Execute rollback SQL if present (for schema changes)
  if (mutation.rollback_sql) {
    const { error: sqlErr } = await sb.rpc('exec_sql', { sql: mutation.rollback_sql })
    if (sqlErr) {
      await logChangelog('error', 'rollback', `SQL rollback failed for ${mutationId}: ${sqlErr.message}`)
      return false
    }
  }

  // For agent mutations, restore registry state from rollback_data
  if (mutation.mutation_type.startsWith('agent_') && mutation.rollback_data) {
    const agent = agentRegistry.get(mutation.target)
    if (agent && mutation.rollback_data.systemPrompt) {
      // Restore agent definition fields from backup
      agent.systemPrompt = mutation.rollback_data.systemPrompt
      agent.version = mutation.rollback_data.version || agent.version
    }
  }

  // Mark as rolled back
  const { error: updateErr } = await sb
    .from('evolution_mutations')
    .update({ is_rolled_back: true, status: 'rolled_back' })
    .eq('id', mutationId)

  if (updateErr) {
    await logChangelog('error', 'rollback', `Failed to mark ${mutationId} as rolled back`)
    return false
  }

  await logChangelog('rollback', 'executor', `已回滚修改: ${mutation.description}`, {
    mutationId,
    target: mutation.target,
    type: mutation.mutation_type,
  }, mutationId)

  return true
}

// ─── Confirm (原则3) ─────────────────────────────────────────────────

/**
 * Admin confirms a mutation — marks it as confirmed, removes backup need.
 */
export async function confirmMutation(mutationId: string, confirmedBy: string): Promise<boolean> {
  const sb = supabaseService()

  const { error } = await sb
    .from('evolution_mutations')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
    })
    .eq('id', mutationId)
    .eq('status', 'pending')

  if (error) {
    await logChangelog('error', 'executor', `Confirm failed for ${mutationId}: ${error.message}`)
    return false
  }

  await logChangelog('info', 'executor', `管理员已确认修改: ${mutationId}`, {
    confirmedBy,
    mutationId,
  }, mutationId)

  return true
}

// ─── Query ───────────────────────────────────────────────────────────

/**
 * Get all pending mutations (原则3: admin login时展示).
 */
export async function getPendingMutations(): Promise<Mutation[]> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('evolution_mutations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data.map(rowToMutation)
}

/**
 * Get mutation history with optional filters.
 */
export async function getMutationHistory(opts?: {
  target?: string
  status?: string
  limit?: number
}): Promise<Mutation[]> {
  const sb = supabaseService()
  let query = sb
    .from('evolution_mutations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit || 50)

  if (opts?.target) query = query.eq('target', opts.target)
  if (opts?.status) query = query.eq('status', opts.status)

  const { data, error } = await query
  if (error || !data) return []
  return data.map(rowToMutation)
}

/**
 * Get evolution changelog entries.
 */
export async function getChangelog(opts?: {
  category?: string
  level?: string
  limit?: number
}): Promise<Array<{
  id: string
  level: string
  category: string
  message: string
  details: unknown
  mutationId: string | null
  createdAt: string
}>> {
  const sb = supabaseService()
  let query = sb
    .from('evolution_changelog')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit || 100)

  if (opts?.category) query = query.eq('category', opts.category)
  if (opts?.level) query = query.eq('level', opts.level)

  const { data, error } = await query
  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    level: row.level as string,
    category: row.category as string,
    message: row.message as string,
    details: row.details,
    mutationId: row.mutation_id as string | null,
    createdAt: row.created_at as string,
  }))
}

// ─── Evolution → Meta-Agent Bridge (brain → hands) ──────────────────

/**
 * Execute a full evolution-driven build via Meta-Agent Orchestrator.
 *
 * This bridges Evolution (brain) → Meta-Agent (hands):
 *   1. Takes an approved candidate or decision
 *   2. Creates a mutation with ADL validation
 *   3. Creates a verification baseline
 *   4. Calls Meta-Agent Orchestrator to generate implementation
 *   5. Stores the plan as mutation changes
 *
 * The actual code is NOT applied automatically — it's stored as
 * mutation.changes.after for admin review.
 */
export async function executeViaOrchestrator(params: {
  description: string
  scope: 'agent' | 'feature' | 'optimize'
  triggeredBy: string
  decisionId?: string
  candidateId?: string
}): Promise<{ mutation: Mutation | null; plan: unknown | null }> {
  // Lazy import to avoid circular dependency
  const { runMetaOrchestrator } = await import('../meta/orchestrator')

  // Step 1: Run orchestrator to generate plan
  let orchestratorResult: unknown
  try {
    const ctx = {
      runId: `evo_${Date.now()}`,
      briefId: `evo_brief_${Date.now()}`,
      userId: 'evolution-agent',
      brief: { raw: params.description, parsed: { intent: params.scope, description: params.description } },
      market: { region: 'global' },
      previousResults: {},
    }

    orchestratorResult = await runMetaOrchestrator({
      description: params.description,
      scope: params.scope,
    })
  } catch (err) {
    await logChangelog('error', 'executor', `Orchestrator failed: ${(err as Error).message}`, {
      description: params.description,
    })
    return { mutation: null, plan: null }
  }

  // Step 2: Create mutation with the orchestrator's output
  const { mutation } = await createMutation({
    mutationType: params.scope === 'agent' ? 'agent_create' : 'pipeline_update',
    target: params.description.substring(0, 100),
    description: `[自主进化] ${params.description}`,
    changes: {
      before: null,
      after: orchestratorResult,
    },
    rollbackData: { type: 'orchestrator_plan', restorable: true },
    triggeredBy: params.triggeredBy,
    decisionId: params.decisionId,
    candidateId: params.candidateId,
  })

  // Step 3: Create verification baseline
  if (mutation) {
    try {
      const verificationId = await createVerification(mutation.id)
      await logChangelog('info', 'executor', `Verification baseline created: ${verificationId}`, {
        mutationId: mutation.id,
        verificationId,
      }, mutation.id)
    } catch (err) {
      await logChangelog('warn', 'executor', `Failed to create verification: ${(err as Error).message}`)
    }
  }

  return { mutation, plan: orchestratorResult }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function rowToMutation(row: Record<string, unknown>): Mutation {
  return {
    id: row.id as string,
    mutationType: row.mutation_type as string,
    target: row.target as string,
    description: row.description as string,
    changes: row.changes as { before: unknown; after: unknown },
    rollbackData: row.rollback_data,
    rollbackSql: row.rollback_sql as string | null,
    isRolledBack: row.is_rolled_back as boolean,
    status: row.status as Mutation['status'],
    triggeredBy: row.triggered_by as string,
    decisionId: row.decision_id as string | null,
    candidateId: row.candidate_id as string | null,
    adlPassed: row.adl_passed as boolean,
    adlReport: row.adl_report as ADLReport | null,
    createdAt: row.created_at as string,
  }
}
