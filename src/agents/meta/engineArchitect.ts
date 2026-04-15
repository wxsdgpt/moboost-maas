/**
 * Engine Architect Agent — 生成引擎层Architect
 * ==============================================
 *
 * Responsibilities:
 *   - Manage model routing and generation pipeline
 *   - Evaluate when to add new models or APIs
 *   - Design pipeline compositions for complex generation tasks
 *   - Optimize model selection based on task type, cost, quality
 *   - Propose new tool integrations
 *
 * Input: Capability requirement or pipeline design request
 * Output: Pipeline specification + model selection rationale + API integration plan
 */

import { AgentDefinition, AgentContext, AgentMetrics } from '../types'
import { MetaAgent, callLLM, getTechStackContext } from './base'

// ─── Agent Definition ─────────────────────────────────────────────────

const DEFINITION: AgentDefinition = {
  id: 'engine-architect',
  nameZh: '引擎层Architect',
  nameEn: 'Engine Architect Agent',
  category: 'meta',
  status: 'active',
  version: '1.0.0',
  systemPrompt: '',
  tools: [
    {
      name: 'analyze_pipeline',
      description: '分析当前生成管线能力',
      parameters: { type: 'object', properties: {} },
      handler: 'src/agents/meta/engineArchitect#analyzePipeline',
    },
    {
      name: 'design_pipeline',
      description: '设计新的生成管线',
      parameters: {
        type: 'object',
        properties: {
          requirement: { type: 'string' },
          constraints: { type: 'object' },
        },
        required: ['requirement'],
      },
      handler: 'src/agents/meta/engineArchitect#designPipeline',
    },
    {
      name: 'evaluate_model',
      description: '评估模型能力与适用性',
      parameters: {
        type: 'object',
        properties: {
          taskType: { type: 'string' },
          requirements: { type: 'array', items: { type: 'string' } },
        },
        required: ['taskType'],
      },
      handler: 'src/agents/meta/engineArchitect#evaluateModel',
    },
  ],
  dependencies: [],
  capabilities: ['model-routing', 'pipeline-design', 'model-evaluation', 'api-integration', 'cost-optimization'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  origin: 'human',
}

// ─── Model Knowledge Base ─────────────────────────────────────────────

const MODEL_CATALOG = `可用模型及能力矩阵：

## 图片生成
| 模型 | ID | 速度 | 质量 | 成本 | 特性 |
|------|-----|------|------|------|------|
| Gemini 3 Pro Image | google/gemini-3-pro-image-preview | ~8s | Ultra | $0.04 | 当前主力，支持文字渲染 |
| Midjourney V6 | midjourney/v6 | ~15s | High | $0.08 | 艺术风格强 |
| SDXL Turbo | stability/sdxl-turbo | ~3s | Med-High | $0.01 | 快速原型 |
| DALL-E 3 | openai/dall-e-3 | ~12s | High | $0.06 | 指令跟随好 |
| Flux Pro | black-forest-labs/flux-pro | ~10s | Ultra | $0.05 | 写实风格 |

## 视频生成
| 模型 | ID | 速度 | 质量 | 成本 | 特性 |
|------|-----|------|------|------|------|
| VEO 3.1 | google/veo-3.1 | ~45s | Ultra | $0.12 | 当前主力，异步模式 |
| Sora | openai/sora | ~60s | High | $0.15 | 长视频能力 |
| Runway Gen-3 | runway/gen3 | ~30s | Med-High | $0.10 | 快速迭代 |

## 推理/文本
| 模型 | ID | 速度 | 质量 | 成本 | 特性 |
|------|-----|------|------|------|------|
| Claude Sonnet 4.6 | anthropic/claude-sonnet-4-6 | Fast | High | $0.003/1k | 当前Agent推理主力 |
| GPT-4o | openai/gpt-4o | Fast | High | $0.005/1k | 多模态理解 |
| Claude Opus 4.6 | anthropic/claude-opus-4-6 | Med | Ultra | $0.015/1k | 复杂推理 |

## 当前管线
1. Brief → Agent推理(Claude Sonnet) → 文案生成
2. 文案 → 图片生成(Gemini 3 Pro) → 素材评估(Claude Sonnet)
3. 文案 → 视频生成(VEO 3.1, 异步) → 素材评估
4. Brief → 落地页HTML生成(Claude Sonnet) → 代码流式输出`

// ─── Implementation ───────────────────────────────────────────────────

class EngineArchitectAgent extends MetaAgent {
  definition = DEFINITION

  protected async run(ctx: AgentContext): Promise<{
    outputs: Record<string, unknown>
    summary: string
    metrics: Partial<AgentMetrics>
  }> {
    const requirement = ctx.params.requirement as string
    if (!requirement) {
      throw new Error('Missing required parameter: requirement (能力需求描述)')
    }

    const taskType = (ctx.params.taskType as string) || 'general'
    const techStack = getTechStackContext()

    const result = await callLLM([
      {
        role: 'system',
        content: `你是 Moboost AI MaaS 平台的生成引擎架构师Agent。
你负责管理和优化模型路由、生成管线，以及评估新能力的接入方案。

# 设计原则
1. 成本效率优先 — 不需要用最贵的模型完成简单任务
2. 容错设计 — 每个模型调用都要有fallback方案
3. 异步优先 — 长时间生成任务使用submit→poll模式
4. 可观测 — 每个管线步骤都要有metrics记录
5. 渐进增强 — 新模型先以experimental状态接入，验证后再切为主力

# 当前技术栈
${techStack}

# 模型知识库
${MODEL_CATALOG}

# 输出格式（严格JSON）
\`\`\`json
{
  "analysis": "需求分析",
  "recommendation": {
    "approach": "推荐方案概述",
    "pipeline": [
      {
        "step": 1,
        "name": "步骤名",
        "model": "model_id",
        "fallback": "fallback_model_id",
        "input": "输入描述",
        "output": "输出描述",
        "async": true/false,
        "estimatedCost": "$X.XX",
        "estimatedLatency": "Xs"
      }
    ],
    "newModelsNeeded": [
      {"id": "model_id", "reason": "需要原因", "integrationEffort": "low/medium/high"}
    ],
    "envVariables": ["需要添加的环境变量"],
    "apiRoutes": [
      {"path": "/api/xxx", "method": "POST", "description": "路由描述"}
    ]
  },
  "costAnalysis": {
    "perExecution": "$X.XX",
    "monthly1000Executions": "$X.XX",
    "comparedToCurrent": "+/-X%"
  },
  "implementationPlan": {
    "codeChanges": ["需要修改的文件和变更描述"],
    "newFiles": ["需要新建的文件"],
    "testPlan": ["测试步骤"]
  },
  "risks": ["风险点"],
  "alternatives": [{"approach": "替代方案", "tradeoff": "取舍分析"}]
}
\`\`\``,
      },
      {
        role: 'user',
        content: `任务类型: ${taskType}\n\n需求描述:\n${requirement}`,
      },
    ], {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 4000,
    })

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(result.content)
    } catch {
      parsed = { raw: result.content, parseError: true }
    }

    const rec = parsed.recommendation as Record<string, unknown> | undefined
    const pipelineSteps = (rec?.pipeline as unknown[])?.length || 0
    const newModels = (rec?.newModelsNeeded as unknown[])?.length || 0

    return {
      outputs: parsed,
      summary: `引擎架构设计完成：${pipelineSteps}步管线，${newModels}个新模型需接入。${(parsed.costAnalysis as Record<string, string>)?.perExecution || ''}每次执行`,
      metrics: {
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        llmCalls: 1,
        modelUsed: result.model,
      },
    }
  }
}

export const engineArchitect = new EngineArchitectAgent()
