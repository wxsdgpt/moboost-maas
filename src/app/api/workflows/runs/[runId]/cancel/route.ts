/**
 * POST /api/workflows/runs/[runId]/cancel — 取消执行
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { getOrCreateCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ runId: string }> }

export async function POST(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const db = supabaseService()

  const { data: run } = await db
    .from('workflow_runs')
    .select('id, created_by, status')
    .eq('id', runId)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.created_by !== user.clerkUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const CANCELLABLE = ['pending', 'estimating', 'awaiting_confirm', 'running']
  if (!CANCELLABLE.includes(run.status)) {
    return NextResponse.json({
      error: `Cannot cancel run in status: ${run.status}`,
    }, { status: 409 })
  }

  // 更新 run 状态
  const { error: runErr } = await db
    .from('workflow_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', runId)

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 })

  // 将所有 pending/running 的节点标记为 skipped
  await db
    .from('node_executions')
    .update({ status: 'skipped' })
    .eq('run_id', runId)
    .in('status', ['pending', 'running'])

  return NextResponse.json({ ok: true, status: 'cancelled' })
}
