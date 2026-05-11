/**
 * Evolution Layer 1 — Capability Candidate Detection
 * ====================================================
 *
 * Discovers potential new capabilities from:
 *   - User behavior patterns (repeated similar briefs, high modify rates)
 *   - Cross-agent co-invocation patterns
 *   - Anomaly signals from Observer
 *   - PCEC self-reflection cycles
 *
 * Layer 2 — Capability Abstraction
 * =================================
 *
 * Abstracts each candidate into a Capability Shape:
 *   - Input: what goes in
 *   - Output: what comes out
 *   - Invariants: what never changes
 *   - Variables: what can be parameterized
 *   - Failure Points: how it can break
 */

import { supabaseService } from '@/lib/db'
import { callLLM, type LLMMessage } from '../meta/base'
import type { VFMScore } from './value-function'

// ─── Types ────────────────────────────────────────────────────────────

export interface CapabilityShape {
  input: string
  output: string
  invariants: string[]
  variables: string[]
  failurePoints: string[]
}

export interface Evidence {
  type: 'user_pattern' | 'cross_agent' | 'anomaly' | 'pcec_insight'
  description: string
  logIds: string[]
  timestamp: string
}

export interface CapabilityCandidate {
  id: string
  source: 'user_pattern' | 'cross_agent' | 'anomaly' | 'pcec' | 'manual'
  title: string
  description: string
  capabilityShape: CapabilityShape
  vfmScore: VFMScore
  totalScore: number
  status: string
  evidence: Evidence[]
  discoveredAt: string
}

// ─── Layer 1: Detection ──────────────────────────────────────────────

/**
 * Scan recent execution logs for user behavior patterns
 * that indicate a missing or underdeveloped capability.
 */
export async function detectUserPatterns(periodDays: number = 7): Promise<CapabilityCandidate[]> {
  const sb = supabaseService()
  const since = new Date(Date.now() - periodDays * 86400000).toISOString()
  const candidates: CapabilityCandidate[] = []

  // Pattern 1: High modify rate on specific agent outputs
  // → Users keep changing the output → agent isn't nailing the task
  const { data: modifyHeavy } = await sb
    .from('agent_execution_logs')
    .select('agent_id, user_action, input_summary')
    .gte('created_at', since)
    .eq('user_action', 'modify')

  if (modifyHeavy && modifyHeavy.length > 0) {
    // Group by agent_id and count
    const modifyCounts: Record<string, { count: number; inputs: unknown[] }> = {}
    modifyHeavy.forEach((log: { agent_id: string; input_summary: unknown }) => {
      if (!modifyCounts[log.agent_id]) modifyCounts[log.agent_id] = { count: 0, inputs: [] }
      modifyCounts[log.agent_id].count++
      if (modifyCounts[log.agent_id].inputs.length < 5) {
        modifyCounts[log.agent_id].inputs.push(log.input_summary)
      }
    })

    // Get total runs per agent for rate calculation
    const { data: totalRuns } = await sb
      .from('agent_execution_logs')
      .select('agent_id')
      .gte('created_at', since)

    const runCounts: Record<string, number> = {}
    if (totalRuns) {
      totalRuns.forEach((r: { agent_id: string }) => {
        runCounts[r.agent_id] = (runCounts[r.agent_id] || 0) + 1
      })
    }

    for (const [agentId, data] of Object.entries(modifyCounts)) {
      const total = runCounts[agentId] || 1
      const modifyRate = data.count / total
      if (modifyRate > 0.4 && data.count >= 3) {
        candidates.push({
          id: `cand_up_${agentId}_${Date.now()}`,
          source: 'user_pattern',
          title: `${agentId} output frequently modified`,
          description: `Users modified ${agentId} output ${data.count}/${total} times (${Math.round(modifyRate * 100)}%) within ${periodDays} days. May need to enhance this agent or split into a specialized sub-agent.`,
          capabilityShape: { input: '', output: '', invariants: [], variables: [], failurePoints: [] },
          vfmScore: { expectationMatch: 0, clientGrowth: 0, speed: 0, simplicity: 0, quality: 0, coverage: 0, totalWeighted: 0 },
          totalScore: 0,
          status: 'discovered',
          evidence: [{
            type: 'user_pattern',
            description: `Modify rate ${Math.round(modifyRate * 100)}% over ${periodDays} days`,
            logIds: [],
            timestamp: new Date().toISOString(),
          }],
          discoveredAt: new Date().toISOString(),
        })
      }
    }
  }

  // Pattern 2: Repeated similar briefs with reject
  // → Users keep trying and getting rejected → gap in capability
  const { data: rejectLogs } = await sb
    .from('agent_execution_logs')
    .select('agent_id, input_summary, id')
    .gte('created_at', since)
    .eq('user_action', 'reject')

  if (rejectLogs && rejectLogs.length >= 3) {
    // Group rejections by agent
    const rejectByAgent: Record<string, string[]> = {}
    rejectLogs.forEach((log: { agent_id: string; id: string }) => {
      if (!rejectByAgent[log.agent_id]) rejectByAgent[log.agent_id] = []
      rejectByAgent[log.agent_id].push(log.id)
    })

    for (const [agentId, logIds] of Object.entries(rejectByAgent)) {
      if (logIds.length >= 3) {
        candidates.push({
          id: `cand_rej_${agentId}_${Date.now()}`,
          source: 'user_pattern',
          title: `${agentId} output frequently rejected`,
          description: `${agentId} had ${logIds.length} outputs directly rejected by users within ${periodDays} days. A deeper analysis of rejection reasons is needed.`,
          capabilityShape: { input: '', output: '', invariants: [], variables: [], failurePoints: [] },
          vfmScore: { expectationMatch: 0, clientGrowth: 0, speed: 0, simplicity: 0, quality: 0, coverage: 0, totalWeighted: 0 },
          totalScore: 0,
          status: 'discovered',
          evidence: [{
            type: 'user_pattern',
            description: `${logIds.length} rejections in ${periodDays} days`,
            logIds: logIds.slice(0, 10),
            timestamp: new Date().toISOString(),
          }],
          discoveredAt: new Date().toISOString(),
        })
      }
    }
  }

  return candidates
}

/**
 * Convert cross-agent patterns from Observer into candidates.
 */
export function patternsToCandidate(patterns: Array<{
  type: string
  agents: string[]
  description: string
  frequency?: number
  confidence?: number
}>): CapabilityCandidate[] {
  return patterns
    .filter((p) => (p.confidence || p.frequency || 0) > 0.7)
    .map((p) => ({
      id: `cand_xag_${p.agents.join('_')}_${Date.now()}`,
      source: 'cross_agent' as const,
      title: p.type === 'co_invocation'
        ? `${p.agents.join(' + ')} always invoked together, can be merged`
        : `${p.agents.join(', ')} exhibit a bottleneck pattern`,
      description: p.description,
      capabilityShape: { input: '', output: '', invariants: [], variables: [], failurePoints: [] },
      vfmScore: { expectationMatch: 0, clientGrowth: 0, speed: 0, simplicity: 0, quality: 0, coverage: 0, totalWeighted: 0 },
      totalScore: 0,
      status: 'discovered' as const,
      evidence: [{
        type: 'cross_agent' as const,
        description: p.description,
        logIds: [],
        timestamp: new Date().toISOString(),
      }],
      discoveredAt: new Date().toISOString(),
    }))
}

// ─── Layer 2: Abstraction ────────────────────────────────────────────

/**
 * Use LLM to abstract a discovered candidate into a Capability Shape.
 * This transforms a raw signal into a structured, evaluable capability definition.
 */
export async function abstractCandidate(candidate: CapabilityCandidate): Promise<CapabilityShape> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are a capability abstraction engine. Your task is to abstract a vague "capability candidate" into a precise "Capability Shape".

Rules:
- You must clearly define: what the input is, what the output is, invariants, variables, and failurePoints
- Do not use vague language ("to some extent", "might be", "essentially", etc. are prohibited)
- Each field must be specific and verifiable
- If a clear definition is not possible, mark it as "NEEDS_MORE_DATA"

Output in strict JSON format:
{
  "input": "input description",
  "output": "output description",
  "invariants": ["invariant1", "invariant2"],
  "variables": ["variable1", "variable2"],
  "failurePoints": ["failure point 1", "failure point 2"]
}`,
    },
    {
      role: 'user',
      content: `Capability candidate:
Title: ${candidate.title}
Description: ${candidate.description}
Source: ${candidate.source}
Evidence: ${JSON.stringify(candidate.evidence, null, 2)}

Please abstract this candidate into a Capability Shape.`,
    },
  ]

  const result = await callLLM(messages, { jsonMode: true, temperature: 0.2 })

  try {
    const shape = JSON.parse(result.content) as CapabilityShape
    return shape
  } catch {
    return {
      input: 'NEEDS_MORE_DATA',
      output: 'NEEDS_MORE_DATA',
      invariants: [],
      variables: [],
      failurePoints: ['Failed to abstract — LLM output was not valid JSON'],
    }
  }
}

// ─── Persistence ─────────────────────────────────────────────────────

/**
 * Save a candidate to the database.
 */
export async function saveCandidate(candidate: CapabilityCandidate): Promise<void> {
  const sb = supabaseService()
  const { error } = await sb.from('capability_candidates').upsert({
    id: candidate.id,
    source: candidate.source,
    title: candidate.title,
    description: candidate.description,
    capability_shape: candidate.capabilityShape,
    vfm_score: candidate.vfmScore,
    total_score: candidate.totalScore,
    status: candidate.status,
    evidence: candidate.evidence,
    discovered_at: candidate.discoveredAt,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    // Save failed silently
  }
}

/**
 * Get all candidates by status.
 */
export async function getCandidatesByStatus(
  status: string | string[],
): Promise<CapabilityCandidate[]> {
  const sb = supabaseService()
  const statuses = Array.isArray(status) ? status : [status]

  const { data, error } = await sb
    .from('capability_candidates')
    .select('*')
    .in('status', statuses)
    .order('total_score', { ascending: false })

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    source: row.source as CapabilityCandidate['source'],
    title: row.title as string,
    description: row.description as string,
    capabilityShape: row.capability_shape as CapabilityShape,
    vfmScore: row.vfm_score as VFMScore,
    totalScore: row.total_score as number,
    status: row.status as string,
    evidence: row.evidence as Evidence[],
    discoveredAt: row.discovered_at as string,
  }))
}

/**
 * Update candidate status.
 */
export async function updateCandidateStatus(
  id: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const sb = supabaseService()
  const { error } = await sb
    .from('capability_candidates')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)

  if (error) {
    // Update failed silently
  }
}
