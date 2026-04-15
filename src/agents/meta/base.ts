/**
 * Meta-Agent — Base Class
 * ========================
 *
 * Shared foundation for all 4 Meta-Agents:
 *   - DataArchitect    — 数据层设计
 *   - EngineArchitect  — 生成引擎层设计
 *   - FrontendArchitect — 前端层设计
 *   - AgentDefiner     — Agent定义Agent
 *
 * Meta-Agents are different from Business Agents:
 *   - They BUILD the platform itself, not end-user outputs
 *   - They use LLM to reason about architecture, not generate content
 *   - Their outputs are code artifacts (SQL, TypeScript, React components, agent configs)
 *   - They are invoked by developers/admins, not by the brief pipeline
 */

import { AgentContext, AgentResult, AgentMetrics, IAgent, AgentDefinition } from '../types'
import { startAgentExecution } from '../evolution/collector'
import { callLLM as unifiedCallLLM } from '@/lib/callLLM'

// ─── LLM Client ───────────────────────────────────────────────────────

const META_AGENT_MODEL = process.env.META_AGENT_MODEL || process.env.AGENT_MODEL || 'anthropic/claude-sonnet-4-6'

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCallResult {
  content: string
  tokensIn: number
  tokensOut: number
  model: string
}

export async function callLLM(
  messages: LLMMessage[],
  options?: {
    model?: string
    temperature?: number
    jsonMode?: boolean
    maxTokens?: number
  },
): Promise<LLMCallResult> {
  const model = options?.model || META_AGENT_MODEL

  const result = await unifiedCallLLM({
    model,
    messages,
    caller: 'meta-agent',
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens,
    responseFormat: options?.jsonMode ? 'json' : 'text',
  })

  return {
    content: result.content,
    tokensIn: result.inputTokens,
    tokensOut: result.outputTokens,
    model: result.model,
  }
}

// ─── Base Meta-Agent Class ────────────────────────────────────────────

export abstract class MetaAgent implements IAgent {
  abstract definition: AgentDefinition

  /** Subclasses implement their specific logic here */
  protected abstract run(ctx: AgentContext): Promise<{
    outputs: Record<string, unknown>
    summary: string
    metrics: Partial<AgentMetrics>
  }>

  /**
   * Self-validation hook (ADL integration).
   *
   * Each Meta-Agent validates its own output before returning.
   * Subclasses can override for domain-specific checks.
   * Default: checks output is non-empty and has expected structure.
   */
  protected async selfValidate(outputs: Record<string, unknown>): Promise<{
    passed: boolean
    issues: string[]
  }> {
    const issues: string[] = []

    // Basic structural validation
    if (!outputs || Object.keys(outputs).length === 0) {
      issues.push('Output is empty — Meta-Agent produced no artifacts')
    }

    // Check for vague/hand-wavy outputs (ADL anti-pattern: Vague Concepts)
    const outputStr = JSON.stringify(outputs)
    const vaguePatterns = ['某种程度上', '本质上是', '可能是一种', '从更高维度']
    for (const pattern of vaguePatterns) {
      if (outputStr.includes(pattern)) {
        issues.push(`Output contains vague language: "${pattern}" — ADL violation`)
      }
    }

    return { passed: issues.length === 0, issues }
  }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const tracker = startAgentExecution(
      this.definition.id,
      this.definition.version,
      ctx,
    )

    const startedAt = Date.now()
    let result: AgentResult

    try {
      const { outputs, summary, metrics } = await this.run(ctx)

      // Self-validation (ADL Layer 6 integration)
      const validation = await this.selfValidate(outputs)
      const validatedSummary = validation.passed
        ? summary
        : `${summary} [ADL自检警告: ${validation.issues.join('; ')}]`

      result = {
        agentId: this.definition.id,
        agentVersion: this.definition.version,
        runId: ctx.runId,
        status: validation.passed ? 'success' : 'success', // still success, but flagged
        outputs: {
          ...outputs,
          _selfValidation: validation,
        },
        summary: validatedSummary,
        metrics: {
          durationMs: Date.now() - startedAt,
          tokensIn: metrics.tokensIn || 0,
          tokensOut: metrics.tokensOut || 0,
          llmCalls: metrics.llmCalls || 0,
          toolCalls: metrics.toolCalls || 0,
          modelUsed: metrics.modelUsed || META_AGENT_MODEL,
          costEstimate: metrics.costEstimate || 0,
        },
        startedAt,
        completedAt: Date.now(),
      }
    } catch (err) {
      result = {
        agentId: this.definition.id,
        agentVersion: this.definition.version,
        runId: ctx.runId,
        status: 'error',
        outputs: {},
        summary: `Error: ${(err as Error).message}`,
        metrics: {
          durationMs: Date.now() - startedAt,
          tokensIn: 0,
          tokensOut: 0,
          llmCalls: 0,
          toolCalls: 0,
          modelUsed: META_AGENT_MODEL,
          costEstimate: 0,
        },
        errors: [{
          code: 'META_AGENT_ERROR',
          message: (err as Error).message,
          recoverable: true,
        }],
        startedAt,
        completedAt: Date.now(),
      }
    }

    tracker.complete(result)
    return result
  }
}

// ─── Shared Context Builders ──────────────────────────────────────────

/** Read current DB schema summary for Data Architect */
export function getCurrentSchemaContext(): string {
  return `当前数据库表结构（Supabase PostgreSQL）：

1. users — 用户表
   - id (uuid PK), clerk_user_id (text unique), email, created_at, updated_at

2. products — 产品表
   - id (uuid PK), user_id (FK→users), name, url, description, category, created_at, updated_at

3. reports — 报告表
   - id (uuid PK), user_id (FK→users), product_id (FK→products), kind, status, input (jsonb), output (jsonb), credits_charged, created_at

4. credit_ledger — 积分账本
   - id (uuid PK), user_id (FK→users), entry_type, amount, status, bucket, expires_at, ref_report_id, ref_reservation, note, created_at

5. subscriptions — 订阅表
   - id (uuid PK), user_id (FK→users), tier, status, lemonsqueezy_sub_id, monthly_credit_grant, created_at

6. market_intel — 竞品情报表
   - id (uuid PK), user_id (FK→users), source, category, raw_data (jsonb), processed_data (jsonb), created_at

7. landing_pages — 落地页表
   - id (uuid PK), user_id (FK→users), product_id, name, html, config (jsonb), status, created_at

8. event_log — 事件日志
   - id (uuid PK), event (text), user_id (FK→users), payload (jsonb), created_at

9. agent_execution_logs — Agent执行日志
   - id (text PK), run_id, agent_id, agent_version, brief_id, user_id, input_summary (jsonb), output_summary (jsonb), metrics (jsonb), user_action, quality_score, tags (text[]), created_at

10. evolution_decisions — 进化决策
    - id (text PK), type, urgency, confidence, target_agents (text[]), impact (jsonb), reasoning, action_items (jsonb), status, created_at

11. evolution_reports — 进化报告
    - id (text PK), period_from, period_to, agent_health (jsonb), system_insights (jsonb), decisions (text[]), system_health_score, executive_summary, generated_at`
}

/** Current tech stack for Engine Architect */
export function getTechStackContext(): string {
  return `当前技术栈：

框架: Next.js 14.2.0 (App Router) + TypeScript + React 18
样式: Tailwind CSS 3.4.0
认证: Clerk v6.12.0
数据库: Supabase (PostgreSQL)
LLM路由: OpenRouter API
  - 图片生成: google/gemini-3-pro-image-preview (环境变量 IMAGE_MODEL)
  - 视频生成: google/veo-3.1 (环境变量 VIDEO_MODEL, 异步模式: submit→poll→download)
  - Agent推理: anthropic/claude-sonnet-4-6 (环境变量 AGENT_MODEL)
  - 评估: anthropic/claude-sonnet-4-6 (环境变量 EVAL_MODEL)
支付: LemonSqueezy (未完成接入)
邮件: Resend (未完成接入)
3D效果: Three.js 0.163.0 (ParticleFlow)

API路由结构:
  /api/brief/agent — 多Agent编排器 (Intent→Clarify→Enrich)
  /api/brief/parse, /clarify, /enrich, /execute — Brief管线
  /api/generate — 图片生成
  /api/generate-video — 视频生成 (VEO 3.1异步)
  /api/evaluate — 素材评估
  /api/landing/generate — 落地页生成
  /api/reports/generate — 报告生成
  /api/evolution — Evolution Agent API
  /api/evolution/agents — Agent注册表API`
}

/** Design system context for Frontend Architect */
export function getDesignSystemContext(): string {
  return `设计系统（Apple-inspired）：

色彩:
  - 主背景: #000000 (暗) / #f5f5f7 (亮)
  - 文字: #1d1d1f (主) / #6f6f77 (次)
  - 交互: #0071e3 (Apple Blue)
  - 成功: #34c759 / 警告: #ff9500 / 错误: #ff3b30

字体: SF Pro Display / SF Pro Text (系统默认 -apple-system)
  - 标题: text-2xl font-bold tracking-tight
  - 正文: text-sm text-[#1d1d1f]
  - 标签: text-[10px] text-[#6f6f77] uppercase tracking-wider

组件模式:
  - 卡片: bg-white rounded-xl p-5 shadow-sm border border-[#e5e5e7]
  - 按钮: px-4 py-2 bg-[#0071e3] text-white rounded-lg text-sm font-medium
  - 标签页: bg-[#f5f5f7] p-1 rounded-lg 内含 bg-white shadow-sm 激活项
  - 状态点: w-2 h-2 rounded-full + 颜色
  - 统计卡: 10px大写标签 + 2xl粗体数值

布局: p-8 max-w-[1400px] mx-auto
图标库: lucide-react`
}
