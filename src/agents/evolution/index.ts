/**
 * Evolution Agent — Main Entry Point (V2: 7-Layer Architecture)
 * ================================================================
 *
 * Public API for the complete Evolution Agent system.
 *
 * 7 Layers:
 *   L1: Capability Candidate Detection (candidates.ts)
 *   L2: Capability Abstraction (candidates.ts)
 *   L3: Internalization Executor (executor.ts)
 *   L4: Capability Merge & Pruning (executor.ts)
 *   L5: PCEC — Periodic Cognitive Expansion Cycle (pcec.ts)
 *   L6: Anti-Degeneration Lock (value-function.ts)
 *   L7: Value Function Mutation (value-function.ts)
 *
 * Three Principles:
 *   P1: 所有修改可一键回滚
 *   P2: 修改记录到changelog，随时可查看
 *   P3: 新修改admin登录时提示，确认后删除backup
 */

import { AgentContext } from '../types'
import {
  startAgentExecution,
  recordUserAction,
  batchUpdateQualityScores,
  queryExecutionLogs,
  getAgentStats,
  type ExecutionTracker,
  type LogQueryOptions,
} from './collector'
import { observeAllAgents, observeAgent, detectCrossAgentPatterns } from './observer'
import {
  runDiagnosticCycle,
  approveDecision,
  rejectDecision,
  getPendingDecisions,
  getLatestReport,
} from './diagnostician'

// V2 imports
import {
  detectUserPatterns,
  patternsToCandidate,
  abstractCandidate,
  saveCandidate,
  getCandidatesByStatus,
  updateCandidateStatus,
} from './candidates'
import {
  scoreCandidate,
  meetsThreshold,
  validateADL,
} from './value-function'
import {
  createMutation,
  executeAgentEnhance,
  executeAgentTune,
  rollbackMutation,
  confirmMutation,
  getPendingMutations,
  getMutationHistory,
  getChangelog,
  logChangelog,
} from './executor'
import {
  runPCECCycle,
  getPCECStatus,
} from './pcec'
import {
  measureGoals,
  updateGoalValues,
  getActiveGoals,
  initializeGoals,
  getPendingVerifications,
  completeVerification,
  computeEvolutionScore,
  createVerification,
} from './goals'

export const evolution = {
  // ─── Execution Tracking ──────────────────────────────────────────

  track(
    agentId: string,
    agentVersion: string,
    ctx: AgentContext,
  ): ExecutionTracker {
    return startAgentExecution(agentId, agentVersion, ctx)
  },

  recordFeedback: recordUserAction,
  batchScores: batchUpdateQualityScores,

  // ─── Observation ─────────────────────────────────────────────────

  observeAll: observeAllAgents,
  observe: observeAgent,
  detectPatterns: detectCrossAgentPatterns,

  // ─── Diagnosis (Legacy V1) ──────────────────────────────────────

  runCycle: runDiagnosticCycle,
  getPendingDecisions,
  approveDecision,
  rejectDecision,
  getLatestReport,

  // ─── Query ───────────────────────────────────────────────────────

  queryLogs: queryExecutionLogs,
  getAgentStats,

  // ─── V2: Layer 1-2 — Candidates & Abstraction ──────────────────

  /** Detect capability candidates from user patterns (Layer 1) */
  detectCandidates: detectUserPatterns,

  /** Convert cross-agent patterns into candidates (Layer 1) */
  patternsToCandidate,

  /** Abstract a candidate into Capability Shape (Layer 2) */
  abstractCandidate,

  /** Save/update a candidate */
  saveCandidate,

  /** Get candidates by status */
  getCandidatesByStatus,

  /** Update candidate lifecycle status */
  updateCandidateStatus,

  // ─── V2: Layer 6-7 — ADL & Value Function ─────────────────────

  /** Score a candidate with VFM (Layer 7) */
  scoreCandidate,

  /** Check if score meets evolution threshold */
  meetsThreshold,

  /** Validate a mutation against ADL (Layer 6) */
  validateADL,

  // ─── V2: Layer 3-4 — Executor & Mutations ─────────────────────

  /** Create a mutation with ADL validation and rollback support */
  createMutation,

  /** Execute agent enhancement mutation */
  executeAgentEnhance,

  /** Execute agent tuning mutation */
  executeAgentTune,

  /** Rollback a mutation (原则1: 一键回滚) */
  rollbackMutation,

  /** Admin confirms a mutation (原则3: 确认后删除backup) */
  confirmMutation,

  /** Get all pending mutations awaiting admin review (原则3) */
  getPendingMutations,

  /** Get mutation history (原则2: 随时可查看) */
  getMutationHistory,

  /** Get evolution changelog (原则2) */
  getChangelog,

  /** Write to evolution changelog */
  logChangelog,

  // ─── V2: Layer 5 — PCEC ────────────────────────────────────────

  /**
   * Run one full PCEC cycle:
   * Detect → Abstract → Score → ADL → Execute → Log
   */
  runPCEC: runPCECCycle,

  /** Get PCEC engine status */
  getPCECStatus,

  // ─── V2: Goals & Verification ─────────────────────────────────

  /** Measure all active goals against current system data */
  measureGoals,

  /** Update goal current values from measured metrics */
  updateGoalValues,

  /** Get all active evolution goals */
  getActiveGoals,

  /** Initialize default goals if they don't exist */
  initializeGoals,

  /** Get pending verifications (mutations not yet verified) */
  getPendingVerifications,

  /** Complete a verification: measure post-mutation metrics and compare */
  completeVerification,

  /** Compute a single evolution health score (0-100) from goal metrics */
  computeEvolutionScore,

  /** Create a verification record before a mutation is applied */
  createVerification,
}

export type { ExecutionTracker, LogQueryOptions }
