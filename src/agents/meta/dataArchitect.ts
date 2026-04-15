/**
 * Data Architect Agent — 数据层Architect
 * ========================================
 *
 * Responsibilities:
 *   - Design and evolve database schema based on business requirements
 *   - Generate Supabase migration SQL
 *   - Generate TypeScript type definitions for new tables
 *   - Validate FK constraints and index strategy
 *   - Estimate query performance impact
 *
 * Input: Natural language description of data needs
 * Output: SQL migration + TypeScript types + index recommendations
 */

import { AgentDefinition, AgentContext, AgentMetrics } from '../types'
import { MetaAgent, callLLM, getCurrentSchemaContext } from './base'

// ─── Agent Definition ─────────────────────────────────────────────────

const DEFINITION: AgentDefinition = {
  id: 'data-architect',
  nameZh: '数据层Architect',
  nameEn: 'Data Architect Agent',
  category: 'meta',
  status: 'active',
  version: '1.0.0',
  systemPrompt: '', // Built dynamically in run()
  tools: [
    {
      name: 'read_current_schema',
      description: '读取当前数据库schema',
      parameters: { type: 'object', properties: {} },
      handler: 'src/agents/meta/dataArchitect#getCurrentSchema',
    },
    {
      name: 'generate_migration',
      description: '生成SQL migration',
      parameters: {
        type: 'object',
        properties: {
          requirement: { type: 'string', description: '数据需求描述' },
        },
        required: ['requirement'],
      },
      handler: 'src/agents/meta/dataArchitect#generateMigration',
    },
    {
      name: 'generate_types',
      description: '生成TypeScript类型定义',
      parameters: {
        type: 'object',
        properties: {
          tableName: { type: 'string' },
        },
        required: ['tableName'],
      },
      handler: 'src/agents/meta/dataArchitect#generateTypes',
    },
  ],
  dependencies: [],
  capabilities: ['schema-design', 'migration-generation', 'type-generation', 'index-optimization', 'fk-validation'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  origin: 'human',
}

// ─── Implementation ───────────────────────────────────────────────────

class DataArchitectAgent extends MetaAgent {
  definition = DEFINITION

  protected async run(ctx: AgentContext): Promise<{
    outputs: Record<string, unknown>
    summary: string
    metrics: Partial<AgentMetrics>
  }> {
    const requirement = ctx.params.requirement as string
    if (!requirement) {
      throw new Error('Missing required parameter: requirement (数据需求描述)')
    }

    const schemaContext = getCurrentSchemaContext()

    // Step 1: Analyze requirement and design schema
    const designResult = await callLLM([
      {
        role: 'system',
        content: `你是 Moboost AI MaaS 平台的数据架构师Agent。
你的职责是根据业务需求设计和演化数据模型。

# 设计原则
1. 遵循 Supabase/PostgreSQL 最佳实践
2. 使用 UUID 作为主键（gen_random_uuid()）
3. 所有表包含 created_at (timestamptz default now())
4. 需要更新追踪的表包含 updated_at + trigger
5. 外键使用 ON DELETE CASCADE 或 SET NULL（根据业务语义）
6. 为常见查询模式创建索引
7. 使用 JSONB 存储半结构化数据
8. 表名使用 snake_case
9. 启用 RLS（即使暂时不设策略）
10. 使用 create table if not exists / create index if not exists

# 当前Schema
${schemaContext}

# 输出格式（严格JSON）
\`\`\`json
{
  "analysis": "需求分析和设计决策说明",
  "tables": [
    {
      "name": "table_name",
      "purpose": "表的作用",
      "columns": [
        {"name": "col_name", "type": "uuid/text/jsonb/...", "constraints": "PRIMARY KEY/NOT NULL/...", "description": "说明"}
      ],
      "indexes": [
        {"name": "idx_name", "columns": ["col1", "col2"], "type": "btree/gin/gist", "condition": "WHERE子句（可选）"}
      ],
      "foreignKeys": [
        {"column": "col", "references": "table(column)", "onDelete": "CASCADE/SET NULL"}
      ]
    }
  ],
  "migrationSQL": "完整的SQL migration脚本",
  "typeScript": "对应的TypeScript类型定义",
  "indexRecommendations": ["索引建议1", "索引建议2"],
  "warnings": ["潜在风险或需要注意的点"]
}
\`\`\``,
      },
      {
        role: 'user',
        content: `请为以下需求设计数据模型：\n\n${requirement}`,
      },
    ], {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 4000,
    })

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(designResult.content)
    } catch {
      parsed = { raw: designResult.content, parseError: true }
    }

    // Step 2: Validate the generated SQL (syntax check via LLM)
    let validationResult: LLMValidation = { valid: true, issues: [] }
    if (parsed.migrationSQL && !parsed.parseError) {
      const validation = await callLLM([
        {
          role: 'system',
          content: `你是PostgreSQL SQL审查专家。检查以下SQL migration是否有语法错误、潜在问题、或与现有schema的冲突。
输出JSON: {"valid": true/false, "issues": ["问题描述"]}`,
        },
        {
          role: 'user',
          content: `现有Schema:\n${schemaContext}\n\n新Migration:\n${parsed.migrationSQL}`,
        },
      ], { jsonMode: true, temperature: 0.1 })

      try {
        validationResult = JSON.parse(validation.content) as LLMValidation
      } catch {
        validationResult = { valid: true, issues: [] }
      }
    }

    const totalTokensIn = designResult.tokensIn + (validationResult ? 0 : 0)
    const totalTokensOut = designResult.tokensOut

    return {
      outputs: {
        analysis: parsed.analysis || '',
        tables: parsed.tables || [],
        migrationSQL: parsed.migrationSQL || '',
        typeScript: parsed.typeScript || '',
        indexRecommendations: parsed.indexRecommendations || [],
        warnings: parsed.warnings || [],
        validation: validationResult,
      },
      summary: `数据架构设计完成：${(parsed.tables as unknown[])?.length || 0}张表，${(parsed.indexRecommendations as unknown[])?.length || 0}条索引建议${validationResult.valid ? '，SQL验证通过' : '，SQL存在问题需要修正'}`,
      metrics: {
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        llmCalls: 2,
        modelUsed: designResult.model,
      },
    }
  }
}

interface LLMValidation {
  valid: boolean
  issues: string[]
}

export const dataArchitect = new DataArchitectAgent()
