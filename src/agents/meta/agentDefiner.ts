/**
 * Agent Definition Agent — Agent定义Agent (Meta中的Meta)
 * =======================================================
 *
 * The most powerful Meta-Agent. Its job is to CREATE new agents.
 *
 * Responsibilities:
 *   - Design complete agent definitions from natural language descriptions
 *   - Generate system prompts, tool sets, dependency graphs
 *   - Coordinate with other Meta-Agents for infrastructure needs
 *   - Register new agents into the system
 *   - Validate agent configs before registration
 *
 * Input: Natural language description of what a new agent should do
 * Output: Complete AgentDefinition + implementation scaffold + infrastructure requests
 *
 * This is the entry point for the self-bootstrapping cycle:
 *   Human: "我们需要一个能自动分析Facebook广告素材库的Agent"
 *   → AgentDefiner: produces full agent spec
 *     → DataArchitect: creates DB tables if needed
 *     → EngineArchitect: designs model pipeline if needed
 *     → FrontendArchitect: creates UI if needed
 *   → New agent registered and ready
 */

import { AgentDefinition, AgentContext, AgentMetrics } from '../types'
import { MetaAgent, callLLM, getCurrentSchemaContext, getTechStackContext } from './base'
import { agentRegistry } from '../registry'

// ─── Agent Definition ─────────────────────────────────────────────────

const DEFINITION: AgentDefinition = {
  id: 'agent-definer',
  nameZh: 'Agent定义Agent',
  nameEn: 'Agent Definition Agent',
  category: 'meta',
  status: 'active',
  version: '1.0.0',
  systemPrompt: '',
  tools: [
    {
      name: 'define_agent',
      description: '定义一个新的业务Agent',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: '新Agent的功能描述' },
          category: { type: 'string', enum: ['business', 'meta'] },
        },
        required: ['description'],
      },
      handler: 'src/agents/meta/agentDefiner#defineAgent',
    },
    {
      name: 'validate_agent_config',
      description: '验证Agent配置的完整性和正确性',
      parameters: {
        type: 'object',
        properties: {
          config: { type: 'object' },
        },
        required: ['config'],
      },
      handler: 'src/agents/meta/agentDefiner#validateConfig',
    },
    {
      name: 'list_current_agents',
      description: '列出当前注册的所有Agent',
      parameters: { type: 'object', properties: {} },
      handler: 'src/agents/meta/agentDefiner#listAgents',
    },
  ],
  dependencies: [],
  capabilities: ['agent-creation', 'prompt-engineering', 'tool-design', 'dependency-analysis', 'config-validation'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  origin: 'human',
}

// ─── Implementation ───────────────────────────────────────────────────

class AgentDefinerAgent extends MetaAgent {
  definition = DEFINITION

  protected async run(ctx: AgentContext): Promise<{
    outputs: Record<string, unknown>
    summary: string
    metrics: Partial<AgentMetrics>
  }> {
    const description = ctx.params.description as string
    if (!description) {
      throw new Error('Missing required parameter: description (新Agent的功能描述)')
    }

    // Gather current system state for context
    const registrySnapshot = agentRegistry.getSystemSnapshot()
    const schemaContext = getCurrentSchemaContext()
    const techStack = getTechStackContext()

    // Step 1: Design the agent
    const designResult = await callLLM([
      {
        role: 'system',
        content: `你是 Moboost AI MaaS 平台的 Agent定义Agent（Meta Agent中的Meta Agent）。
你的职责是根据自然语言描述，设计完整的Agent定义。

# 设计原则
1. 单一职责 — 每个Agent只做一件事，做到极致
2. 明确边界 — 清晰定义输入/输出schema，不模糊
3. 可组合 — 通过依赖关系与其他Agent协作
4. 可观测 — 输出必须包含结构化的metrics
5. 可进化 — 预留Evolution Agent优化空间
6. 最优解 — 不做临时补丁，设计面向未来的方案

# 当前Agent生态
${JSON.stringify(registrySnapshot.agents.map((a) => ({
  id: a.id,
  nameZh: a.nameZh,
  category: a.category,
  status: a.status,
  capabilities: a.capabilities,
  dependencies: a.dependencies,
})), null, 2)}

# 当前数据库Schema
${schemaContext}

# 技术栈
${techStack}

# 输出格式（严格JSON）
\`\`\`json
{
  "analysis": {
    "needAssessment": "为什么需要这个Agent",
    "existingOverlap": "与现有Agent的能力重叠分析",
    "uniqueValue": "这个Agent的独特价值",
    "complexityEstimate": "low|medium|high"
  },
  "agentDefinition": {
    "id": "kebab-case-id",
    "nameZh": "中文名",
    "nameEn": "English Name Agent",
    "category": "business|meta",
    "systemPrompt": "完整的system prompt（至少200字，包含角色定义、能力范围、输出格式要求）",
    "tools": [
      {
        "name": "tool_name",
        "description": "工具描述",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        },
        "handler": "src/agents/tools/xxx"
      }
    ],
    "dependencies": ["依赖的agent-id"],
    "capabilities": ["capability-tag"],
    "model": null
  },
  "infrastructureNeeds": {
    "database": {
      "needed": true/false,
      "tables": ["需要的新表描述"],
      "reason": "为什么需要"
    },
    "models": {
      "needed": true/false,
      "models": ["需要的新模型"],
      "reason": "为什么需要"
    },
    "frontend": {
      "needed": true/false,
      "pages": ["需要的新页面"],
      "reason": "为什么需要"
    }
  },
  "implementationSkeleton": {
    "fileName": "src/agents/business/xxx.ts",
    "code": "TypeScript实现骨架代码",
    "testCases": ["测试场景描述"]
  },
  "integrationPlan": {
    "pipelinePosition": "在执行DAG中的位置说明",
    "dataFlow": "数据流入流出描述",
    "evolutionHooks": "Evolution Agent需要观察的关键指标"
  }
}
\`\`\`

生成的systemPrompt必须具体、可操作、包含足够的约束和输出格式要求。不要生成泛泛而谈的prompt。`,
      },
      {
        role: 'user',
        content: `请设计以下Agent：\n\n${description}`,
      },
    ], {
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 6000,
    })

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(designResult.content)
    } catch {
      parsed = { raw: designResult.content, parseError: true }
    }

    // Step 2: Validate the generated definition
    const agentDef = parsed.agentDefinition as Record<string, unknown> | undefined
    const validationIssues: string[] = []

    if (agentDef) {
      // Check ID uniqueness
      if (agentRegistry.get(agentDef.id as string)) {
        validationIssues.push(`ID "${agentDef.id}" 已被占用，需要换一个`)
      }
      // Check dependencies exist
      const deps = agentDef.dependencies as string[] || []
      for (const dep of deps) {
        if (!agentRegistry.get(dep)) {
          validationIssues.push(`依赖 "${dep}" 在注册表中不存在`)
        }
      }
      // Check system prompt length
      const prompt = agentDef.systemPrompt as string || ''
      if (prompt.length < 100) {
        validationIssues.push(`systemPrompt过短（${prompt.length}字），建议至少200字`)
      }
      // Check tools have handlers
      const tools = agentDef.tools as Array<Record<string, unknown>> || []
      for (const tool of tools) {
        if (!tool.handler) {
          validationIssues.push(`工具 "${tool.name}" 缺少handler`)
        }
      }
    }

    // Step 3: Check infrastructure needs
    const infra = parsed.infrastructureNeeds as Record<string, Record<string, unknown>> | undefined
    const infraRequests: string[] = []
    if (infra?.database?.needed) infraRequests.push('数据层变更（需DataArchitect）')
    if (infra?.models?.needed) infraRequests.push('引擎层变更（需EngineArchitect）')
    if (infra?.frontend?.needed) infraRequests.push('前端层变更（需FrontendArchitect）')

    return {
      outputs: {
        ...parsed,
        validation: {
          issues: validationIssues,
          valid: validationIssues.length === 0,
        },
        infrastructureRequests: infraRequests,
        readyToRegister: validationIssues.length === 0 && !parsed.parseError,
      },
      summary: `Agent设计完成：${agentDef?.nameZh || '未命名'} (${agentDef?.id || 'no-id'})，${(agentDef?.tools as unknown[])?.length || 0}个工具，${(agentDef?.capabilities as unknown[])?.length || 0}项能力。${validationIssues.length > 0 ? `发现${validationIssues.length}个问题` : '验证通过'}${infraRequests.length > 0 ? `，需要${infraRequests.join(' + ')}` : ''}`,
      metrics: {
        tokensIn: designResult.tokensIn,
        tokensOut: designResult.tokensOut,
        llmCalls: 1,
        modelUsed: designResult.model,
      },
    }
  }
}

export const agentDefiner = new AgentDefinerAgent()
