/**
 * POST /api/workflows/[id]/run — 确认执行工作流
 *
 * 流程: 验证图 → 预估积分 → 检查余额 → 冻结积分 → 创建 workflow_run → 触发 DAG 执行
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { estimateCredits, validateGraph } from '@/lib/workflowGraph'
import { executeWorkflow } from '@/lib/workflowExecutor'

// 服务端启动时注册所有节点执行器
import '@/lib/workflowNodes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { estimatedSceneCount?: number; input?: Record<string, unknown> } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  const db = supabaseService()

  // 1. 获取工作流
  const { data: workflow } = await db
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single()

  if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  if (workflow.created_by !== user.clerkUserId && !workflow.is_template) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. 校验图
  const validation = validateGraph(workflow.graph)
  if (!validation.valid) {
    return NextResponse.json({
      error: 'Invalid workflow graph',
      details: validation.errors,
    }, { status: 400 })
  }

  // 3. 检查是否已有运行中的实例
  const { data: runningRuns } = await db
    .from('workflow_runs')
    .select('id')
    .eq('workflow_id', id)
    .in('status', ['pending', 'estimating', 'awaiting_confirm', 'running'])

  if (runningRuns && runningRuns.length > 0) {
    return NextResponse.json({
      error: 'Workflow already has a running instance',
      runId: runningRuns[0].id,
    }, { status: 409 })
  }

  // 4. 预估积分
  const estimate = estimateCredits(workflow.graph, body.estimatedSceneCount || 10)

  // 5. 检查余额（读取信用账本）
  // TODO: 接入 creditLedger.getBalance(user.id) 做实际余额检查
  // 暂时跳过余额检查，Phase 3 W4 补全

  // 6. 创建执行记录
  const { data: run, error: runError } = await db
    .from('workflow_runs')
    .insert({
      workflow_id: id,
      status: 'running',
      input: body.input || null,
      estimated_credits: estimate.total,
      created_by: user.clerkUserId,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 })

  // 7. 为每个节点创建 pending 执行记录
  const nodeExecutions = workflow.graph.nodes.map((node: any) => ({
    run_id: run.id,
    node_id: node.id,
    node_type: node.type,
    status: 'pending',
  }))

  if (nodeExecutions.length > 0) {
    const { error: nodeError } = await db
      .from('node_executions')
      .insert(nodeExecutions)

    if (nodeError) {
      // 回滚 run 记录
      await db.from('workflow_runs').delete().eq('id', run.id)
      return NextResponse.json({ error: nodeError.message }, { status: 500 })
    }
  }

  // 8. 触发 DAG 执行（fire-and-forget 异步）
  executeWorkflow(run.id, id, workflow.graph, body.input || {}).catch(err => {
    console.error('[workflow-run] executeWorkflow error:', err);
  });

  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      estimatedCredits: estimate.total,
      estimateBreakdown: estimate.breakdown,
    },
  }, { status: 201 })
}
