/**
 * Evolution Layer 5 — Periodic Cognitive Expansion Cycle (PCEC)
 * ==============================================================
 *
 * The full autonomous evolution pipeline:
 *   1. Detect capability candidates (Layer 1)
 *   2. Abstract candidates into Capability Shapes (Layer 2)
 *   3. Score with Value Function (Layer 7)
 *   4. Filter through ADL (Layer 6)
 *   5. Execute high-value candidates (Layer 3)
 *   6. Merge/prune overlapping capabilities (Layer 4)
 *   7. Log everything (原则2)
 *
 * Trigger: API call from scheduled task or manual admin action.
 * Self-constraint: if 2 consecutive cycles produce nothing, force a structural rethink.
 */

import {
  detectUserPatterns,
  patternsToCandidate,
  abstractCandidate,
  saveCandidate,
  getCandidatesByStatus,
  updateCandidateStatus,
  type CapabilityCandidate,
} from './candidates'
import { scoreCandidate, meetsThreshold } from './value-function'
import { createMutation, logChangelog, rollbackMutation } from './executor'
import { detectCrossAgentPatterns, observeAllAgents } from './observer'
import { runDiagnosticCycle } from './diagnostician'
import { runExploration } from './intelligence'
import {
  measureGoals,
  updateGoalValues,
  getActiveGoals,
  initializeGoals,
  getPendingVerifications,
  completeVerification,
  computeEvolutionScore,
} from './goals'

// ─── State ───────────────────────────────────────────────────────────

let consecutiveEmptyCycles = 0
let lastCycleAt: string | null = null

// ─── Main PCEC Cycle ─────────────────────────────────────────────────

export interface PCECResult {
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
  diagnosticReport: unknown | null
  wasForceBreakthrough: boolean
  log: string[]
}

/**
 * Run one full PCEC cycle.
 *
 * This is the heartbeat of the evolution system.
 */
export async function runPCECCycle(periodDays: number = 7): Promise<PCECResult> {
  const cycleId = `pcec_${Date.now()}`
  const startedAt = new Date().toISOString()
  const log: string[] = []
  const wasForceBreakthrough = consecutiveEmptyCycles >= 2

  log.push(`[PCEC] Cycle ${cycleId} started${wasForceBreakthrough ? ' (FORCE BREAKTHROUGH MODE)' : ''}`)

  await logChangelog('info', 'pcec', `PCEC Cycle ${cycleId} started`, {
    consecutiveEmptyCycles,
    wasForceBreakthrough,
  })

  let candidatesDiscovered = 0
  let candidatesAbstracted = 0
  let candidatesScored = 0
  let candidatesApproved = 0
  let mutationsCreated = 0
  let verificationsCompleted = 0
  let verificationsRolledBack = 0
  let evolutionScore = 0
  let diagnosticReport: unknown = null

  try {
    // ─── Phase 0: Verify Previous Mutations ──────────────────────
    log.push('[PCEC] Phase 0: Verifying pending mutations from previous cycles...')
    try {
      const pendingVers = await getPendingVerifications()
      if (pendingVers.length > 0) {
        const goals = await getActiveGoals()
        for (const ver of pendingVers) {
          try {
            const result = await completeVerification(ver.id, goals)
            verificationsCompleted++
            log.push(`[PCEC] Verified ${ver.id}: ${result.verdict} — ${result.verdictReason}`)

            // Auto-rollback if WHY-layer degraded
            if (result.autoRollbackTriggered) {
              log.push(`[PCEC] ⚠️ WHY-layer degradation detected, auto-rolling back mutation ${ver.mutationId}`)
              const rolled = await rollbackMutation(ver.mutationId)
              if (rolled) {
                verificationsRolledBack++
                log.push(`[PCEC] ↩️ Auto-rollback successful for ${ver.mutationId}`)
              } else {
                log.push(`[PCEC] ❌ Auto-rollback failed for ${ver.mutationId}`)
              }
            }
          } catch (err) {
            log.push(`[PCEC] Verification failed for ${ver.id}: ${(err as Error).message}`)
          }
        }
      } else {
        log.push('[PCEC] No pending verifications')
      }
    } catch (err) {
      log.push(`[PCEC] Phase 0 failed: ${(err as Error).message}`)
    }

    // ─── Phase 1: Run Evolution Diagnostic Cycle ──────────────────
    log.push('[PCEC] Phase 1: Running diagnostic cycle...')
    try {
      diagnosticReport = await runDiagnosticCycle(periodDays)
      log.push('[PCEC] Diagnostic cycle complete')
    } catch (err) {
      log.push(`[PCEC] Diagnostic cycle failed: ${(err as Error).message}`)
    }

    // ─── Phase 1.5: Autonomous Intelligence Collection ─────────────
    log.push('[PCEC] Phase 1.5: Running intelligence exploration...')
    try {
      const exploreResult = await runExploration({ maxEntriesPerRun: 10 })
      log.push(`[PCEC] Intelligence: ${exploreResult.tasksProcessed} tasks, ${exploreResult.entriesCreated} entries stored`)
      for (const line of exploreResult.log.slice(-5)) {
        log.push(`  ${line}`)
      }
    } catch (err) {
      log.push(`[PCEC] Intelligence exploration failed: ${(err as Error).message}`)
    }

    // ─── Phase 2: Detect Candidates (Layer 1) ─────────────────────
    log.push('[PCEC] Phase 2: Detecting capability candidates...')

    // From user behavior patterns
    const userCandidates = await detectUserPatterns(periodDays)
    log.push(`[PCEC] Found ${userCandidates.length} user pattern candidates`)

    // From cross-agent patterns
    const crossPatterns = await detectCrossAgentPatterns(periodDays)
    const crossCandidates = patternsToCandidate(
      crossPatterns.map((p) => ({ ...p, confidence: p.frequency }))
    )
    log.push(`[PCEC] Found ${crossCandidates.length} cross-agent candidates`)

    const allCandidates = [...userCandidates, ...crossCandidates]
    candidatesDiscovered = allCandidates.length

    if (allCandidates.length === 0 && !wasForceBreakthrough) {
      log.push('[PCEC] No candidates found, cycle ends early')
      consecutiveEmptyCycles++
      lastCycleAt = new Date().toISOString()

      await logChangelog('info', 'pcec', `PCEC Cycle ${cycleId} 无新候选`, {
        consecutiveEmptyCycles,
      })

      return buildResult(cycleId, startedAt, log, {
        candidatesDiscovered, candidatesAbstracted, candidatesScored,
        candidatesApproved, mutationsCreated, verificationsCompleted, verificationsRolledBack,
        evolutionScore, diagnosticReport, wasForceBreakthrough,
      })
    }

    // ─── Phase 3: Abstract Candidates (Layer 2) ───────────────────
    log.push('[PCEC] Phase 3: Abstracting candidates...')

    for (const candidate of allCandidates) {
      try {
        const shape = await abstractCandidate(candidate)
        candidate.capabilityShape = shape
        candidate.status = 'abstracted'
        await saveCandidate(candidate)
        candidatesAbstracted++
        log.push(`[PCEC] Abstracted: ${candidate.title}`)
      } catch (err) {
        log.push(`[PCEC] Abstraction failed for ${candidate.title}: ${(err as Error).message}`)
      }
    }

    // ─── Phase 4: Score with VFM (Layer 7) ────────────────────────
    log.push('[PCEC] Phase 4: Scoring candidates with VFM...')

    const abstracted = allCandidates.filter((c) => c.status === 'abstracted')

    for (const candidate of abstracted) {
      try {
        const score = await scoreCandidate(candidate)
        candidate.vfmScore = score
        candidate.totalScore = score.totalWeighted
        candidate.status = 'scored'
        await saveCandidate(candidate)
        candidatesScored++

        if (meetsThreshold(score)) {
          candidate.status = 'approved'
          await saveCandidate(candidate)
          candidatesApproved++
          log.push(`[PCEC] ✅ Approved: ${candidate.title} (score: ${score.totalWeighted})`)
        } else {
          candidate.status = 'rejected'
          await saveCandidate(candidate)
          log.push(`[PCEC] ❌ Below threshold: ${candidate.title} (score: ${score.totalWeighted})`)
        }
      } catch (err) {
        log.push(`[PCEC] VFM scoring failed for ${candidate.title}: ${(err as Error).message}`)
      }
    }

    // ─── Phase 5: Create Mutations for Approved (Layer 3) ─────────
    log.push('[PCEC] Phase 5: Creating mutations for approved candidates...')

    const approved = allCandidates.filter((c) => c.status === 'approved')

    for (const candidate of approved) {
      try {
        // Determine mutation type from candidate source
        const mutationType = inferMutationType(candidate)

        const { mutation } = await createMutation({
          mutationType,
          target: candidate.title,
          description: `[PCEC自动] ${candidate.description}`,
          changes: {
            before: null,
            after: {
              capabilityShape: candidate.capabilityShape,
              vfmScore: candidate.vfmScore,
            },
          },
          rollbackData: { status: 'pre_mutation', candidateId: candidate.id },
          triggeredBy: 'pcec',
          candidateId: candidate.id,
        })

        if (mutation) {
          candidate.status = 'building'
          await updateCandidateStatus(candidate.id, 'building', {
            linked_mutation_id: mutation.id,
          })
          mutationsCreated++
          log.push(`[PCEC] Mutation created: ${mutation.id} for ${candidate.title}`)
        }
      } catch (err) {
        log.push(`[PCEC] Mutation creation failed for ${candidate.title}: ${(err as Error).message}`)
      }
    }

    // ─── Phase 6: Measure Goals & Compute Evolution Score ────────
    log.push('[PCEC] Phase 6: Measuring goals and computing evolution score...')
    try {
      await initializeGoals()
      const metrics = await measureGoals()
      await updateGoalValues(metrics)
      const goals = await getActiveGoals()
      evolutionScore = computeEvolutionScore(goals, metrics)
      log.push(`[PCEC] Evolution score: ${evolutionScore}/100`)
      log.push(`[PCEC] Metrics: ${JSON.stringify(metrics)}`)
    } catch (err) {
      log.push(`[PCEC] Goal measurement failed: ${(err as Error).message}`)
    }

    // ─── Phase 7: Check consecutive empty cycles ──────────────────
    if (mutationsCreated > 0 || candidatesApproved > 0) {
      consecutiveEmptyCycles = 0
    } else {
      consecutiveEmptyCycles++
    }

    log.push(`[PCEC] Cycle complete. Discovered: ${candidatesDiscovered}, Approved: ${candidatesApproved}, Mutations: ${mutationsCreated}`)

  } catch (err) {
    log.push(`[PCEC] Cycle failed: ${(err as Error).message}`)
    await logChangelog('error', 'pcec', `PCEC Cycle ${cycleId} failed`, {
      error: (err as Error).message,
    })
  }

  lastCycleAt = new Date().toISOString()

  await logChangelog('evolution', 'pcec', `PCEC Cycle ${cycleId} complete`, {
    candidatesDiscovered,
    candidatesAbstracted,
    candidatesScored,
    candidatesApproved,
    mutationsCreated,
    verificationsCompleted,
    verificationsRolledBack,
    evolutionScore,
    consecutiveEmptyCycles,
  })

  return buildResult(cycleId, startedAt, log, {
    candidatesDiscovered, candidatesAbstracted, candidatesScored,
    candidatesApproved, mutationsCreated, verificationsCompleted, verificationsRolledBack,
    evolutionScore, diagnosticReport, wasForceBreakthrough,
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────

function inferMutationType(candidate: CapabilityCandidate): string {
  if (candidate.source === 'cross_agent') return 'agent_merge'
  if (candidate.title.includes('拒绝')) return 'agent_enhance'
  if (candidate.title.includes('修改')) return 'prompt_update'
  return 'agent_enhance'
}

function buildResult(
  cycleId: string,
  startedAt: string,
  log: string[],
  stats: {
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
  },
): PCECResult {
  return {
    cycleId,
    startedAt,
    completedAt: new Date().toISOString(),
    log,
    ...stats,
  }
}

/**
 * Get PCEC status.
 */
export function getPCECStatus(): {
  lastCycleAt: string | null
  consecutiveEmptyCycles: number
  nextForceBreakthrough: boolean
} {
  return {
    lastCycleAt,
    consecutiveEmptyCycles,
    nextForceBreakthrough: consecutiveEmptyCycles >= 2,
  }
}
