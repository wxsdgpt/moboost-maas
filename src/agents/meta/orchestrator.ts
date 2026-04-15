/**
 * Meta-Agent Orchestrator
 * ========================
 *
 * Coordinates the 4 Meta-Agents to handle platform-building requests.
 *
 * Flow:
 *   1. AgentDefiner receives natural language request → designs agent spec
 *   2. If spec needs DB changes → DataArchitect generates migration
 *   3. If spec needs new models → EngineArchitect designs pipeline
 *   4. If spec needs UI → FrontendArchitect generates components
 *   5. All outputs assembled into a complete implementation plan
 *
 * The orchestrator does NOT auto-execute changes — it produces a plan
 * that a human (or Evolution Agent) reviews and approves.
 */

import { AgentContext, AgentResult } from '../types'
import { agentDefiner } from './agentDefiner'
import { dataArchitect } from './dataArchitect'
import { engineArchitect } from './engineArchitect'
import { frontendArchitect } from './frontendArchitect'

// ─── Types ────────────────────────────────────────────────────────────

export interface MetaOrchestratorRequest {
  /** What do you want to build? */
  description: string
  /** Scope: 'agent' (create new agent), 'feature' (add feature), 'optimize' (improve existing) */
  scope: 'agent' | 'feature' | 'optimize'
  /** Skip certain Meta-Agents if not needed */
  skip?: ('data' | 'engine' | 'frontend')[]
}

export interface MetaOrchestratorResult {
  /** Overall status */
  status: 'success' | 'partial' | 'error'
  /** Summary for human */
  summary: string
  /** Agent definition (if scope = 'agent') */
  agentSpec?: AgentResult
  /** Data layer changes */
  dataChanges?: AgentResult
  /** Engine layer changes */
  engineChanges?: AgentResult
  /** Frontend layer changes */
  frontendChanges?: AgentResult
  /** Assembled implementation plan */
  implementationPlan: ImplementationPlan
}

export interface ImplementationPlan {
  /** Ordered steps to execute */
  steps: ImplementationStep[]
  /** Files to create */
  newFiles: Array<{ path: string; description: string; content?: string }>
  /** Files to modify */
  modifiedFiles: Array<{ path: string; description: string; changes?: string }>
  /** SQL to run */
  migrations: string[]
  /** Environment variables to add */
  envVars: string[]
  /** Estimated effort */
  effort: 'trivial' | 'small' | 'medium' | 'large'
}

export interface ImplementationStep {
  order: number
  agent: string
  action: string
  description: string
  status: 'pending' | 'completed' | 'skipped' | 'failed'
  result?: Record<string, unknown>
}

// ─── Orchestrator ─────────────────────────────────────────────────────

export async function runMetaOrchestrator(
  request: MetaOrchestratorRequest,
): Promise<MetaOrchestratorResult> {
  const runId = `meta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const skipSet = new Set(request.skip || [])

  const plan: ImplementationPlan = {
    steps: [],
    newFiles: [],
    modifiedFiles: [],
    migrations: [],
    envVars: [],
    effort: 'medium',
  }

  let agentSpec: AgentResult | undefined
  let dataChanges: AgentResult | undefined
  let engineChanges: AgentResult | undefined
  let frontendChanges: AgentResult | undefined
  const summaryParts: string[] = []

  // ─── Step 1: Agent Definition ────────────────────────────────────

  if (request.scope === 'agent') {
    const ctx = buildContext(runId, {
      description: request.description,
    }, 1, 4)

    agentSpec = await agentDefiner.execute(ctx)
    plan.steps.push({
      order: 1,
      agent: 'agent-definer',
      action: 'define_agent',
      description: 'Agent定义设计',
      status: agentSpec.status === 'success' ? 'completed' : 'failed',
      result: agentSpec.outputs,
    })

    if (agentSpec.status === 'success') {
      summaryParts.push(agentSpec.summary)

      // Extract infrastructure needs
      const infraNeeds = agentSpec.outputs.infrastructureNeeds as Record<string, Record<string, unknown>> | undefined
      const skeleton = agentSpec.outputs.implementationSkeleton as Record<string, string> | undefined

      if (skeleton?.fileName && skeleton?.code) {
        plan.newFiles.push({
          path: skeleton.fileName,
          description: 'Agent实现文件',
          content: skeleton.code,
        })
      }

      // ─── Step 2: Data Architect (if needed) ──────────────────────

      if (infraNeeds?.database?.needed && !skipSet.has('data')) {
        const tables = infraNeeds.database.tables as string[] || []
        const dataCtx = buildContext(runId, {
          requirement: `为新Agent "${(agentSpec.outputs.agentDefinition as Record<string, unknown>)?.nameZh || 'unknown'}" 创建所需的数据表。\n\n需求：${tables.join('；')}`,
        }, 2, 4)

        dataChanges = await dataArchitect.execute(dataCtx)
        plan.steps.push({
          order: 2,
          agent: 'data-architect',
          action: 'generate_migration',
          description: '数据层设计',
          status: dataChanges.status === 'success' ? 'completed' : 'failed',
          result: dataChanges.outputs,
        })

        if (dataChanges.status === 'success') {
          summaryParts.push(dataChanges.summary)
          const sql = dataChanges.outputs.migrationSQL as string
          if (sql) plan.migrations.push(sql)
          const ts = dataChanges.outputs.typeScript as string
          if (ts) {
            plan.newFiles.push({
              path: 'src/types/generated.ts',
              description: '自动生成的类型定义',
              content: ts,
            })
          }
        }
      } else {
        plan.steps.push({
          order: 2,
          agent: 'data-architect',
          action: 'skipped',
          description: '数据层无需变更',
          status: 'skipped',
        })
      }

      // ─── Step 3: Engine Architect (if needed) ────────────────────

      if (infraNeeds?.models?.needed && !skipSet.has('engine')) {
        const models = infraNeeds.models.models as string[] || []
        const engineCtx = buildContext(runId, {
          requirement: `为新Agent "${(agentSpec.outputs.agentDefinition as Record<string, unknown>)?.nameZh || 'unknown'}" 设计生成管线。\n\n需要的模型/能力：${models.join('；')}`,
          taskType: 'pipeline_design',
        }, 3, 4)

        engineChanges = await engineArchitect.execute(engineCtx)
        plan.steps.push({
          order: 3,
          agent: 'engine-architect',
          action: 'design_pipeline',
          description: '引擎层设计',
          status: engineChanges.status === 'success' ? 'completed' : 'failed',
          result: engineChanges.outputs,
        })

        if (engineChanges.status === 'success') {
          summaryParts.push(engineChanges.summary)
          const rec = engineChanges.outputs.recommendation as Record<string, unknown> | undefined
          const envVars = rec?.envVariables as string[] || []
          plan.envVars.push(...envVars)
        }
      } else {
        plan.steps.push({
          order: 3,
          agent: 'engine-architect',
          action: 'skipped',
          description: '引擎层无需变更',
          status: 'skipped',
        })
      }

      // ─── Step 4: Frontend Architect (if needed) ──────────────────

      if (infraNeeds?.frontend?.needed && !skipSet.has('frontend')) {
        const pages = infraNeeds.frontend.pages as string[] || []
        const feCtx = buildContext(runId, {
          requirement: `为新Agent "${(agentSpec.outputs.agentDefinition as Record<string, unknown>)?.nameZh || 'unknown'}" 创建管理/交互界面。\n\n需要的页面：${pages.join('；')}`,
          outputType: 'page',
        }, 4, 4)

        frontendChanges = await frontendArchitect.execute(feCtx)
        plan.steps.push({
          order: 4,
          agent: 'frontend-architect',
          action: 'generate_page',
          description: '前端层设计',
          status: frontendChanges.status === 'success' ? 'completed' : 'failed',
          result: frontendChanges.outputs,
        })

        if (frontendChanges.status === 'success') {
          summaryParts.push(frontendChanges.summary)
          const files = frontendChanges.outputs.files as Array<Record<string, string>> | undefined
          if (files) {
            for (const f of files) {
              plan.newFiles.push({
                path: f.path,
                description: f.description,
                content: f.code,
              })
            }
          }
        }
      } else {
        plan.steps.push({
          order: 4,
          agent: 'frontend-architect',
          action: 'skipped',
          description: '前端层无需变更',
          status: 'skipped',
        })
      }
    }
  } else {
    // ─── Feature / Optimize mode ─────────────────────────────────
    // For non-agent requests, route directly to relevant Meta-Agents

    if (!skipSet.has('data')) {
      const dataCtx = buildContext(runId, { requirement: request.description }, 1, 3)
      dataChanges = await dataArchitect.execute(dataCtx)
      plan.steps.push({
        order: 1,
        agent: 'data-architect',
        action: 'analyze',
        description: '数据层分析',
        status: dataChanges.status === 'success' ? 'completed' : 'failed',
        result: dataChanges.outputs,
      })
      if (dataChanges.status === 'success') summaryParts.push(dataChanges.summary)
    }

    if (!skipSet.has('engine')) {
      const engineCtx = buildContext(runId, {
        requirement: request.description,
        taskType: request.scope,
      }, 2, 3)
      engineChanges = await engineArchitect.execute(engineCtx)
      plan.steps.push({
        order: 2,
        agent: 'engine-architect',
        action: 'analyze',
        description: '引擎层分析',
        status: engineChanges.status === 'success' ? 'completed' : 'failed',
        result: engineChanges.outputs,
      })
      if (engineChanges.status === 'success') summaryParts.push(engineChanges.summary)
    }

    if (!skipSet.has('frontend')) {
      const feCtx = buildContext(runId, {
        requirement: request.description,
        outputType: 'page',
      }, 3, 3)
      frontendChanges = await frontendArchitect.execute(feCtx)
      plan.steps.push({
        order: 3,
        agent: 'frontend-architect',
        action: 'design',
        description: '前端层设计',
        status: frontendChanges.status === 'success' ? 'completed' : 'failed',
        result: frontendChanges.outputs,
      })
      if (frontendChanges.status === 'success') summaryParts.push(frontendChanges.summary)
    }
  }

  // ─── Estimate effort ──────────────────────────────────────────

  const completedSteps = plan.steps.filter((s) => s.status === 'completed').length
  const totalSteps = plan.steps.filter((s) => s.status !== 'skipped').length
  plan.effort = plan.newFiles.length + plan.migrations.length > 5 ? 'large'
    : plan.newFiles.length > 2 ? 'medium'
    : plan.newFiles.length > 0 ? 'small'
    : 'trivial'

  const overallStatus = completedSteps === totalSteps ? 'success'
    : completedSteps > 0 ? 'partial'
    : 'error'

  return {
    status: overallStatus,
    summary: summaryParts.join(' | ') || '未生成任何输出',
    agentSpec,
    dataChanges,
    engineChanges,
    frontendChanges,
    implementationPlan: plan,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function buildContext(
  runId: string,
  params: Record<string, unknown>,
  currentIndex: number,
  totalAgents: number,
): AgentContext {
  return {
    runId,
    targetMarkets: [],
    upstreamOutputs: {},
    params,
    pipeline: {
      startedAt: Date.now(),
      totalAgents,
      currentIndex,
    },
  }
}
