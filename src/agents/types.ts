/**
 * Agent Framework — Core Type Definitions
 * ========================================
 *
 * Unified type system for all agents in the Moboost MaaS platform.
 *
 * Architecture layers:
 *   1. Business Agents   — 竞品雷达, 文案, 设计, 风控, 本地化
 *   2. Meta Agents       — 数据Architect, 引擎Architect, 前端Architect, Agent定义
 *   3. Evolution Agent   — 观察, 诊断, 决策 (enhance/split/merge/create)
 *   4. Orchestrator      — DAG-based execution with dependency resolution
 */

// ─── Agent Identity & Registration ────────────────────────────────────

export type AgentCategory = 'business' | 'meta' | 'evolution' | 'orchestrator'

export type AgentStatus = 'active' | 'degraded' | 'disabled' | 'experimental'

export interface AgentDefinition {
  /** Unique agent identifier, e.g. 'copywriter', 'designer', 'compliance' */
  id: string
  /** Display name (Chinese) */
  nameZh: string
  /** Display name (English) */
  nameEn: string
  /** Category for routing and permissions */
  category: AgentCategory
  /** Current operational status */
  status: AgentStatus
  /** Semantic version for tracking evolution */
  version: string
  /** System prompt template (supports {{variable}} interpolation) */
  systemPrompt: string
  /** Tools this agent can invoke */
  tools: AgentToolDefinition[]
  /** Which agents' outputs this agent depends on */
  dependencies: string[]
  /** Capability tags for Evolution Agent to reason about */
  capabilities: string[]
  /** Model to use (defaults to AGENT_MODEL env) */
  model?: string
  /** Creation metadata */
  createdAt: string
  /** Last modified */
  updatedAt: string
  /** Who/what created this agent: 'human' | 'evolution' | 'meta-agent' */
  origin: 'human' | 'evolution' | 'meta-agent'
}

// ─── Agent Tools ──────────────────────────────────────────────────────

export interface AgentToolDefinition {
  name: string
  description: string
  /** JSON Schema for parameters */
  parameters: Record<string, unknown>
  /** Handler function path, e.g. 'src/agents/tools/generateImage' */
  handler: string
}

// ─── Agent Execution Context ──────────────────────────────────────────

export interface AgentContext {
  /** Execution run ID (shared across all agents in one pipeline run) */
  runId: string
  /** Brief ID if triggered by brief execution */
  briefId?: string
  /** User ID */
  userId?: string
  /** Product context */
  product?: {
    name: string
    url?: string
    category?: string
    targetMarkets?: string[]
  }
  /** Target markets for localization */
  targetMarkets: string[]
  /** Outputs from upstream agents (keyed by agent ID) */
  upstreamOutputs: Record<string, AgentResult>
  /** Arbitrary parameters passed to this agent */
  params: Record<string, unknown>
  /** Pipeline-level metadata */
  pipeline: {
    startedAt: number
    totalAgents: number
    currentIndex: number
  }
}

// ─── Agent Execution Result ───────────────────────────────────────────

export interface AgentResult {
  agentId: string
  agentVersion: string
  runId: string
  status: 'success' | 'partial' | 'error' | 'skipped'
  /** Structured outputs — schema varies per agent */
  outputs: Record<string, unknown>
  /** Human-readable summary of what was done */
  summary: string
  /** Execution metrics */
  metrics: AgentMetrics
  /** Errors if any */
  errors?: AgentError[]
  /** Timestamps */
  startedAt: number
  completedAt: number
}

export interface AgentMetrics {
  durationMs: number
  tokensIn: number
  tokensOut: number
  llmCalls: number
  toolCalls: number
  modelUsed: string
  costEstimate: number  // USD
}

export interface AgentError {
  code: string
  message: string
  recoverable: boolean
  context?: Record<string, unknown>
}

// ─── Execution Log (for Evolution Agent) ──────────────────────────────

export interface AgentExecutionLog {
  id: string
  runId: string
  agentId: string
  agentVersion: string
  briefId?: string
  userId?: string
  /** Full input context (sanitized — no secrets) */
  inputSummary: Record<string, unknown>
  /** Full output */
  outputSummary: Record<string, unknown>
  /** Execution metrics */
  metrics: AgentMetrics
  /** User's action on the output */
  userAction: 'accepted' | 'modified' | 'rejected' | 'ignored' | null
  /** If modified, what changed (diff) */
  modificationDiff?: string
  /** Quality score (0-100, from evaluation agent or user feedback) */
  qualityScore?: number
  /** Tags for categorization */
  tags: string[]
  createdAt: string
}

// ─── Evolution Agent Types ────────────────────────────────────────────

export type EvolutionDecisionType =
  | 'enhance'    // 增强现有Agent能力
  | 'split'      // 分裂Agent为多个专项Agent
  | 'merge'      // 合并Agent减少冗余
  | 'create'     // 创建全新Agent
  | 'deprecate'  // 废弃Agent
  | 'tune'       // 微调参数（system prompt、temperature等）

export type EvolutionUrgency = 'immediate' | 'next_sprint' | 'backlog' | 'observation'

export interface EvolutionDecision {
  id: string
  type: EvolutionDecisionType
  urgency: EvolutionUrgency
  /** Confidence 0-1, based on data sufficiency */
  confidence: number
  /** Which agent(s) are affected */
  targetAgents: string[]
  /** Impact assessment */
  impact: {
    qualityImprovement: number   // estimated % improvement
    costChange: number           // positive = more expensive
    complexityChange: number     // positive = more complex
    riskLevel: 'low' | 'medium' | 'high'
  }
  /** LLM-generated reasoning */
  reasoning: string
  /** Concrete action items */
  actionItems: EvolutionAction[]
  /** How to rollback if things go wrong */
  rollbackPlan: string
  /** Was this auto-executed or needs human review? */
  requiresHumanReview: boolean
  /** Current status */
  status: 'proposed' | 'approved' | 'executing' | 'completed' | 'rejected' | 'rolled_back'
  createdAt: string
  resolvedAt?: string
  resolvedBy?: 'auto' | 'human'
}

export interface EvolutionAction {
  type: 'update_prompt' | 'add_tool' | 'remove_tool' | 'create_agent' | 'disable_agent' | 'merge_agents' | 'adjust_param'
  target: string
  description: string
  /** Before/after for trackability */
  before?: string
  after?: string
  executed: boolean
}

// ─── Evolution Observation & Diagnostics ──────────────────────────────

export interface AgentHealthReport {
  agentId: string
  period: { from: string; to: string }
  /** Execution stats */
  stats: {
    totalRuns: number
    successRate: number
    avgDurationMs: number
    avgTokensUsed: number
    avgCostPerRun: number
    avgQualityScore: number
  }
  /** User interaction stats */
  userInteraction: {
    acceptRate: number
    modifyRate: number
    rejectRate: number
    ignoreRate: number
  }
  /** Trend indicators */
  trends: {
    qualityTrend: 'improving' | 'stable' | 'degrading'
    usageTrend: 'growing' | 'stable' | 'declining'
    costTrend: 'decreasing' | 'stable' | 'increasing'
  }
  /** Detected anomalies */
  anomalies: AgentAnomaly[]
  /** Raw data points for visualization */
  timeSeries: TimeSeriesPoint[]
}

export interface AgentAnomaly {
  type: 'quality_drop' | 'cost_spike' | 'failure_burst' | 'usage_shift' | 'pattern_change'
  severity: 'info' | 'warning' | 'critical'
  description: string
  detectedAt: string
  dataPoints: Record<string, number>
}

export interface TimeSeriesPoint {
  timestamp: string
  value: number
  metric: string
}

// ─── Evolution Report (periodic output) ───────────────────────────────

export interface EvolutionReport {
  id: string
  period: { from: string; to: string }
  generatedAt: string
  /** Per-agent health reports */
  agentHealth: AgentHealthReport[]
  /** Cross-agent insights */
  systemInsights: string[]
  /** Proposed decisions */
  decisions: EvolutionDecision[]
  /** Overall system health score */
  systemHealthScore: number
  /** Summary for human consumption */
  executiveSummary: string
}

// ─── Agent Interface (what all agents must implement) ─────────────────

export interface IAgent {
  definition: AgentDefinition
  execute(ctx: AgentContext): Promise<AgentResult>
}

// ─── Pipeline / Orchestrator Types ────────────────────────────────────

export interface PipelineDefinition {
  id: string
  name: string
  /** Execution DAG: each phase runs in parallel, phases run sequentially */
  phases: PipelinePhase[]
}

export interface PipelinePhase {
  id: string
  name: string
  /** Agents to run in parallel within this phase */
  agents: string[]
  /** Continue to next phase even if some agents fail? */
  allowPartialFailure: boolean
}

export interface PipelineRun {
  id: string
  pipelineId: string
  briefId?: string
  userId?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  phases: {
    phaseId: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    results: Record<string, AgentResult>
  }[]
  startedAt: number
  completedAt?: number
}
