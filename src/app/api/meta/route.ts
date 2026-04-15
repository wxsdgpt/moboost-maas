/**
 * POST /api/meta — Run Meta-Agent orchestrator
 *
 * Body:
 *   {
 *     "description": "新Agent/功能的自然语言描述",
 *     "scope": "agent" | "feature" | "optimize",
 *     "skip": ["data", "engine", "frontend"]  // optional
 *   }
 *
 * Returns: Full orchestration result with implementation plan
 */

import { NextRequest, NextResponse } from 'next/server'
import { meta } from '@/agents/meta'
import '@/agents/registry/bootstrap'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      description?: string
      scope?: 'agent' | 'feature' | 'optimize'
      skip?: ('data' | 'engine' | 'frontend')[]
    }

    if (!body.description) {
      return NextResponse.json(
        { ok: false, error: 'missing description' },
        { status: 400 },
      )
    }

    const result = await meta.orchestrate({
      description: body.description,
      scope: body.scope || 'agent',
      skip: body.skip,
    })

    // Flatten for API response (strip large code blocks for summary)
    return NextResponse.json({
      ok: true,
      status: result.status,
      summary: result.summary,
      plan: {
        steps: result.implementationPlan.steps.map((s) => ({
          order: s.order,
          agent: s.agent,
          action: s.action,
          description: s.description,
          status: s.status,
        })),
        newFiles: result.implementationPlan.newFiles.map((f) => ({
          path: f.path,
          description: f.description,
          hasCode: !!f.content,
          codeLines: f.content?.split('\n').length || 0,
        })),
        modifiedFiles: result.implementationPlan.modifiedFiles,
        migrations: result.implementationPlan.migrations.length,
        envVars: result.implementationPlan.envVars,
        effort: result.implementationPlan.effort,
      },
      // Full details per agent
      agentSpec: result.agentSpec ? {
        status: result.agentSpec.status,
        summary: result.agentSpec.summary,
        outputs: result.agentSpec.outputs,
      } : null,
      dataChanges: result.dataChanges ? {
        status: result.dataChanges.status,
        summary: result.dataChanges.summary,
        outputs: result.dataChanges.outputs,
      } : null,
      engineChanges: result.engineChanges ? {
        status: result.engineChanges.status,
        summary: result.engineChanges.summary,
        outputs: result.engineChanges.outputs,
      } : null,
      frontendChanges: result.frontendChanges ? {
        status: result.frontendChanges.status,
        summary: result.frontendChanges.summary,
        outputs: result.frontendChanges.outputs,
      } : null,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
