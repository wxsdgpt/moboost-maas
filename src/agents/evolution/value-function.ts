/**
 * Evolution Layer 7 — Value Function Mutation (VFM)
 * ===================================================
 *
 * Scores capability candidates aligned with WHY/HOW/WHAT goal framework.
 *
 * V-Score dimensions:
 *   WHY层 (weight 4x):
 *     1. expectationMatch — 能否提升生成结果与客户预期的匹配度？
 *     2. clientGrowth    — 能否帮助系统伴随客户成长？
 *   HOW层 (weight 3x):
 *     3. speed           — 能否让用户更快拿到结果？
 *     4. simplicity      — 能否减少用户交互轮次和修改成本？
 *   WHAT层 (weight 2x):
 *     5. quality         — 能否提升信息准确性和生成质量？
 *     6. coverage        — 能否覆盖更多市场/语言/素材类型？
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
  // WHY层
  expectationMatch: number  // 0-10: 提升客户预期匹配度
  clientGrowth: number      // 0-10: 帮助系统伴随客户成长
  // HOW层
  speed: number             // 0-10: 更快产出
  simplicity: number        // 0-10: 更少交互轮次 / 更低修改成本
  // WHAT层
  quality: number           // 0-10: 更准的信息 / 更高的生成质量
  coverage: number          // 0-10: 更广的能力覆盖

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
      content: `你是Moboost AI的进化价值评估引擎。

核心使命：在MarTech市场上生成效果最符合客户预期的产品，伴随每个客户不断成长。

对每个能力候选从6个维度打分（0-10），分为三层：

【WHY — 为什么用我们】权重最高
1. expectationMatch: 这个能力能否提升"生成结果与客户预期的匹配度"？
   - 直接提升accept rate = 10
   - 减少客户需要修改的内容 = 7
   - 间接改善 = 4
   - 几乎无关 = 1

2. clientGrowth: 这个能力能否帮助系统"伴随客户成长"？（学习偏好、记住历史、越用越准）
   - 显著增强个性化/学习能力 = 10
   - 有一定积累效应 = 6
   - 每次独立无积累 = 2

【HOW — 怎么用我们】
3. speed: 能否让用户更快拿到结果？（更快≠更少token，是用户可感知的速度提升）
   - 显著加快生成速度 = 10
   - 减少等待/重试 = 7
   - 无感知变化 = 1

4. simplicity: 能否让用户交互更简洁？（更少轮次、更少手动修改）
   - 用户一句话搞定原来需要3轮的事 = 10
   - 减少1-2轮交互 = 6
   - 不影响 = 1

【WHAT — 用哪些功能】
5. quality: 能否提升信息准确性和生成质量？（合规更准、数据更可靠、素材更专业）
   - 消除关键质量问题 = 10
   - 提升细节质量 = 6
   - 仅视觉/格式改善 = 2

6. coverage: 能否扩展能力覆盖面？（支持更多市场/语言/素材类型）
   - 打开全新市场 = 10
   - 新增重要素材类型 = 7
   - 边缘场景 = 2

严格规则：
- 只改善内部系统成本但用户无感 → 所有维度 ≤ 2
- 仅在极端场景使用 → coverage ≤ 2, speed ≤ 2
- 增加用户操作复杂度 → simplicity = 0

输出JSON:
{
  "expectationMatch": N, "clientGrowth": N,
  "speed": N, "simplicity": N,
  "quality": N, "coverage": N,
  "reasoning": "一句话理由"
}`,
    },
    {
      role: 'user',
      content: `能力候选:
标题: ${candidate.title}
描述: ${candidate.description}
能力轮廓: ${JSON.stringify(candidate.capabilityShape)}
来源: ${candidate.source}
证据: ${JSON.stringify(candidate.evidence)}`,
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
      content: `你是反劣化锁（Anti-Degeneration Lock, ADL）审核引擎。

你的职责是验证一个进化修改是否满足以下优先级约束（不可违反）：
1. Stability（稳定性）：修改后能跑1000次不崩吗？
2. Explainability（可解释性）：能说清为什么做这个修改吗？
3. Reusability（可复用性）：修改后的能力能用在别的场景吗？
4. Novelty Bias（新颖性偏差）：是不是为了新颖而牺牲了稳定？

附加约束（WHY/HOW/WHAT框架）：
- 修改必须对用户有可感知的价值（更准、更快、更简单）
- 仅优化内部成本（减少token）但用户无感的修改 → FAIL
- 增加用户操作复杂度的修改 → FAIL

劣化进化检测清单：
- Fake Intelligence：为了"显得聪明"增加无意义复杂步骤 → FAIL
- Unverifiable：引入无法验证结果的机制 → FAIL
- Vague Concepts：使用"某种程度上"、"本质上"等玄学术语 → FAIL
- Novelty Bias：为了新颖而牺牲稳定 → FAIL
- User Invisible：对用户完全不可见的优化 → WARN

输出JSON：
{
  "stabilityCheck": { "passed": bool, "reason": "..." },
  "explainabilityCheck": { "passed": bool, "reason": "..." },
  "reusabilityCheck": { "passed": bool, "reason": "..." },
  "noveltyBiasCheck": { "passed": bool, "reason": "..." },
  "rollbackPlan": "如果炸了，如何一键恢复",
  "failureCondition": "怎么判断它炸了（如accept rate下降5%以上）",
  "verdict": "pass" | "fail" | "warn",
  "overallReason": "一句话总结"
}`,
    },
    {
      role: 'user',
      content: `待审核的进化修改：
类型: ${mutation.type}
目标: ${mutation.target}
描述: ${mutation.description}
变更前: ${JSON.stringify(mutation.changes.before)}
变更后: ${JSON.stringify(mutation.changes.after)}`,
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
      overallReason: 'ADL引擎调用失败，安全起见拒绝此修改',
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
