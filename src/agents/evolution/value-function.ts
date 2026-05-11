/**
 * Evolution Layer 7 — Value Function Mutation (VFM)
 * ===================================================
 *
 * Scores capability candidates aligned with WHY/HOW/WHAT goal framework.
 *
 * V-Score dimensions:
 *   WHY layer (weight 4x):
 *     1. expectationMatch — Can it improve the match between generated results and client expectations?
 *     2. clientGrowth    — Can it help the system grow alongside each client?
 *   HOW layer (weight 3x):
 *     3. speed           — Can it help users get results faster?
 *     4. simplicity      — Can it reduce the number of interaction rounds and revision costs?
 *   WHAT layer (weight 2x):
 *     5. quality         — Can it improve information accuracy and generation quality?
 *     6. coverage        — Can it cover more markets/languages/asset types?
 *
 * Threshold: totalWeighted < 50 → reject candidate
 *
 * Layer 6 — Anti-Degeneration Lock (ADL)
 * ========================================
 *
 * Validates evolution decisions against:
 *   Priority: Stability > Explainability > Reusability > Scalability > Novelty
 */

import { callLLM, type LLMMessage } from '../meta/base'
import type { CapabilityCandidate } from './candidates'

// ─── Layer 7: Value Function ─────────────────────────────────────────

export interface VFMScore {
  // WHY layer
  expectationMatch: number  // 0-10: Improve client expectation match
  clientGrowth: number      // 0-10: Help system grow alongside client
  // HOW layer
  speed: number             // 0-10: Faster output
  simplicity: number        // 0-10: Fewer interaction rounds / lower revision cost
  // WHAT layer
  quality: number           // 0-10: More accurate information / higher generation quality
  coverage: number          // 0-10: Broader capability coverage

  totalWeighted: number     // computed
}

const VFM_WEIGHTS = {
  expectationMatch: 4,
  clientGrowth: 4,
  speed: 3,
  simplicity: 3,
  quality: 2,
  coverage: 2,
}

const VFM_MAX_SCORE = Object.values(VFM_WEIGHTS).reduce((s, w) => s + w * 10, 0) // 180

const VFM_THRESHOLD = 50 // Absolute score. Max possible = 180.

/**
 * Score a capability candidate using LLM-assisted evaluation.
 */
export async function scoreCandidate(candidate: CapabilityCandidate): Promise<VFMScore> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are the evolution value assessment engine for Moboost AI.

Core mission: Build the product in the MarTech market that best matches client expectations, growing alongside each client.

Score each capability candidate on 6 dimensions (0-10), divided into three layers:

[WHY — Why use us] Highest weight
1. expectationMatch: Can this capability improve the "match between generated results and client expectations"?
   - Directly improves accept rate = 10
   - Reduces content the client needs to revise = 7
   - Indirect improvement = 4
   - Almost irrelevant = 1

2. clientGrowth: Can this capability help the system "grow alongside the client"? (learn preferences, remember history, improve with use)
   - Significantly enhances personalization/learning capability = 10
   - Has some cumulative effect = 6
   - Independent each time, no accumulation = 2

[HOW — How to use us]
3. speed: Can it help users get results faster? (faster != fewer tokens; it means user-perceivable speed improvement)
   - Significantly accelerates generation speed = 10
   - Reduces waiting/retries = 7
   - No perceivable change = 1

4. simplicity: Can it make user interactions simpler? (fewer rounds, less manual editing)
   - User accomplishes in one message what used to take 3 rounds = 10
   - Reduces 1-2 interaction rounds = 6
   - No impact = 1

[WHAT — Which features]
5. quality: Can it improve information accuracy and generation quality? (more accurate compliance, more reliable data, more professional assets)
   - Eliminates critical quality issues = 10
   - Improves detail quality = 6
   - Only visual/formatting improvements = 2

6. coverage: Can it expand capability coverage? (support more markets/languages/asset types)
   - Opens an entirely new market = 10
   - Adds an important asset type = 7
   - Edge cases = 2

Strict rules:
- Only improves internal system cost but user cannot perceive it -> all dimensions <= 2
- Only used in extreme scenarios -> coverage <= 2, speed <= 2
- Increases user operational complexity -> simplicity = 0

Output JSON:
{
  "expectationMatch": N, "clientGrowth": N,
  "speed": N, "simplicity": N,
  "quality": N, "coverage": N,
  "reasoning": "one-sentence rationale"
}`,
    },
    {
      role: 'user',
      content: `Capability candidate:
Title: ${candidate.title}
Description: ${candidate.description}
Capability shape: ${JSON.stringify(candidate.capabilityShape)}
Source: ${candidate.source}
Evidence: ${JSON.stringify(candidate.evidence)}`,
    },
  ]

  try {
    const result = await callLLM(messages, { jsonMode: true, temperature: 0.1 })
    const parsed = JSON.parse(result.content)

    const score: VFMScore = {
      expectationMatch: clamp(parsed.expectationMatch || 0, 0, 10),
      clientGrowth: clamp(parsed.clientGrowth || 0, 0, 10),
      speed: clamp(parsed.speed || 0, 0, 10),
      simplicity: clamp(parsed.simplicity || 0, 0, 10),
      quality: clamp(parsed.quality || 0, 0, 10),
      coverage: clamp(parsed.coverage || 0, 0, 10),
      totalWeighted: 0,
    }

    score.totalWeighted =
      score.expectationMatch * VFM_WEIGHTS.expectationMatch +
      score.clientGrowth * VFM_WEIGHTS.clientGrowth +
      score.speed * VFM_WEIGHTS.speed +
      score.simplicity * VFM_WEIGHTS.simplicity +
      score.quality * VFM_WEIGHTS.quality +
      score.coverage * VFM_WEIGHTS.coverage

    return score
  } catch {
    return {
      expectationMatch: 3, clientGrowth: 2,
      speed: 3, simplicity: 3,
      quality: 3, coverage: 2,
      totalWeighted: 50,
    }
  }
}

/**
 * Check if a VFM score meets the threshold for evolution.
 */
export function meetsThreshold(score: VFMScore): boolean {
  return score.totalWeighted >= VFM_THRESHOLD
}

/**
 * Get VFM max possible score (for UI display).
 */
export function getVFMMaxScore(): number {
  return VFM_MAX_SCORE
}

// ─── Layer 6: Anti-Degeneration Lock ─────────────────────────────────

export interface ADLReport {
  stabilityCheck: { passed: boolean; reason: string }
  explainabilityCheck: { passed: boolean; reason: string }
  reusabilityCheck: { passed: boolean; reason: string }
  noveltyBiasCheck: { passed: boolean; reason: string }
  rollbackPlan: string
  failureCondition: string
  verdict: 'pass' | 'fail' | 'warn'
  overallReason: string
}

/**
 * Validate a proposed mutation against the Anti-Degeneration Lock.
 *
 * Priority order (NEVER violate):
 *   1. Stability — must run 1000 times without breaking
 *   2. Explainability — must be able to explain WHY
 *   3. Reusability — must work across scenarios
 *   4. Scalability — must handle growth
 *   5. Novelty — least important
 */
export async function validateADL(mutation: {
  type: string
  target: string
  description: string
  changes: { before: unknown; after: unknown }
}): Promise<ADLReport> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are the Anti-Degeneration Lock (ADL) review engine.

Your responsibility is to verify whether an evolution mutation satisfies the following priority constraints (must not be violated):
1. Stability: Can it run 1000 times without crashing after the change?
2. Explainability: Can you clearly explain why this change was made?
3. Reusability: Can the modified capability be used in other scenarios?
4. Novelty Bias: Was stability sacrificed for the sake of novelty?

Additional constraints (WHY/HOW/WHAT framework):
- The change must have user-perceivable value (more accurate, faster, simpler)
- Changes that only optimize internal costs (reduce tokens) but are imperceptible to users -> FAIL
- Changes that increase user operational complexity -> FAIL

Degenerate evolution detection checklist:
- Fake Intelligence: Adding meaningless complex steps to "appear smart" -> FAIL
- Unverifiable: Introducing mechanisms whose results cannot be verified -> FAIL
- Vague Concepts: Using mystical terms like "to some extent", "essentially" -> FAIL
- Novelty Bias: Sacrificing stability for novelty -> FAIL
- User Invisible: Optimizations completely invisible to users -> WARN

Output JSON:
{
  "stabilityCheck": { "passed": bool, "reason": "..." },
  "explainabilityCheck": { "passed": bool, "reason": "..." },
  "reusabilityCheck": { "passed": bool, "reason": "..." },
  "noveltyBiasCheck": { "passed": bool, "reason": "..." },
  "rollbackPlan": "How to restore with one click if it fails",
  "failureCondition": "How to determine it failed (e.g., accept rate drops by more than 5%)",
  "verdict": "pass" | "fail" | "warn",
  "overallReason": "one-sentence summary"
}`,
    },
    {
      role: 'user',
      content: `Evolution mutation pending review:
Type: ${mutation.type}
Target: ${mutation.target}
Description: ${mutation.description}
Before change: ${JSON.stringify(mutation.changes.before)}
After change: ${JSON.stringify(mutation.changes.after)}`,
    },
  ]

  try {
    const result = await callLLM(messages, { jsonMode: true, temperature: 0.1 })
    return JSON.parse(result.content) as ADLReport
  } catch {
    return {
      stabilityCheck: { passed: false, reason: 'ADL validation call failed' },
      explainabilityCheck: { passed: false, reason: 'Could not assess' },
      reusabilityCheck: { passed: false, reason: 'Could not assess' },
      noveltyBiasCheck: { passed: false, reason: 'Could not assess' },
      rollbackPlan: 'Revert all changes from rollback_data',
      failureCondition: 'ADL engine failure — auto-reject for safety',
      verdict: 'fail',
      overallReason: 'ADL engine call failed; rejecting this mutation as a safety precaution',
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
