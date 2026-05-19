/**
 * POST /api/workflows/runs/[runId]/review — 审批操作
 *
 * body: { nodeId: string, action: 'approve' | 'reject', modifiedOutput?: any }
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { resumeWorkflow } from '@/lib/workflowExecutor'

import '@/lib/workflowNodes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ runId: string }> }

export async function POST(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params

  let body: { nodeId?: string; action?: string; modifiedOutput?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { nodeId, action, modifiedOutput } = body

  if (!nodeId || typeof nodeId !== 'string') {
    return NextResponse.json({ error: 'nodeId is required' }, { status: 400 })
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  const db = supabaseService()

  // 验证 run 存在且属于当前用户
  const { data: run } = await db
    .from('workflow_runs')
    .select('id, created_by, status')
    .eq('id', runId)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.created_by !== user.clerkUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (run.status !== 'paused') {
    return NextResponse.json({ error: `Run is not paused (status: ${run.status})` }, { status: 409 })
  }

  // 验证节点处于审批等待状态
  const { data: nodeExec } = await db
    .from('node_executions')
    .select('status, node_type')
    .eq('run_id', runId)
    .eq('node_id', nodeId)
    .single()

  if (!nodeExec) return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  if (nodeExec.node_type !== 'human_review') {
    return NextResponse.json({ error: 'Node is not a review node' }, { status: 400 })
  }

  // 执行审批操作（异步恢复）
  resumeWorkflow(runId, nodeId, action, modifiedOutput).catch(err => {
    console.error('[review] resumeWorkflow error:', err)
  })

  return NextResponse.json({
    ok: true,
    action,
    nodeId,
    status: action === 'approve' ? 'resuming' : 'rejected',
  })
}
