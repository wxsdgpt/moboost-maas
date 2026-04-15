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
          title: `${agentId} 输出频繁被修改`,
          description: `用户在 ${periodDays} 天内修改了 ${agentId} 的输出 ${data.count}/${total} 次 (${Math.round(modifyRate * 100)}%)。可能需要增强该Agent或拆分出专门子Agent。`,
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
          title: `${agentId} 输出频繁被拒绝`,
          description: `${agentId} 在 ${periodDays} 天内有 ${logIds.length} 次输出被用户直接拒绝。需要深入分析拒绝原因。`,
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
        ? `${p.agents.join(' + ')} 总是一起调用，可合并`
        : `${p.agents.join(', ')} 存在瓶颈模式`,
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
      content: `你是一个能力抽象引擎。你的任务是将一个模糊的"能力候选"抽象为精确的"能力轮廓（Capability Shape）"。

规则：
- 必须明确定义：输入是什么、输出是什么、不变量（invariants）、可变参数（variables）、失败点（failurePoints）
- 不使用模糊语言（"某种程度上"、"可能是"、"本质上"等禁止出现）
- 每个字段必须是具体的、可验证的
- 如果无法明确定义，标注为 "NEEDS_MORE_DATA"

输出严格JSON格式：
{
  "input": "输入描述",
  "output": "输出描述",
  "invariants": ["不变量1", "不变量2"],
  "variables": ["可变参数1", "可变参数2"],
  "failurePoints": ["失败点1", "失败点2"]
}`,
    },
    {
      role: 'user',
      content: `能力候选：
标题: ${candidate.title}
描述: ${candidate.description}
来源: ${candidate.source}
证据: ${JSON.stringify(candidate.evidence, null, 2)}

请将此候选抽象为能力轮廓。`,
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
