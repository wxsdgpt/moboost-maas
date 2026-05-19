/**
 * GET /api/workflows/runs/[runId]/sse — SSE 实时进度推送
 *
 * 客户端通过 EventSource 连接，每秒轮询数据库获取最新状态
 * 当 run status 为 completed/failed/cancelled 时关闭连接
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { getOrCreateCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ runId: string }> }

export async function GET(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
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

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled']
      let lastStatus = ''

      const poll = async () => {
        try {
          // 获取 run 最新状态
          const { data: currentRun } = await db
            .from('workflow_runs')
            .select('status, progress, credits_consumed, error, output')
            .eq('id', runId)
            .single()

          if (!currentRun) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Run not found' })}\n\n`))
            controller.close()
            return
          }

          // 获取节点状态
          const { data: nodeExecs } = await db
            .from('node_executions')
            .select('node_id, node_type, status, output, error, started_at, completed_at')
            .eq('run_id', runId)

          const nodeStatuses: Record<string, any> = {}
          for (const ne of (nodeExecs || [])) {
            nodeStatuses[ne.node_id] = {
              nodeId: ne.node_id,
              status: ne.status,
              output: ne.output,
              error: ne.error,
              startedAt: ne.started_at,
              completedAt: ne.completed_at,
            }
          }

          // 推送进度事件
          const event = {
            type: 'progress',
            runId,
            status: currentRun.status,
            progress: currentRun.progress,
            creditsConsumed: currentRun.credits_consumed,
            nodeStatuses,
            ...(currentRun.error ? { error: currentRun.error } : {}),
            ...(currentRun.output ? { output: currentRun.output } : {}),
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          lastStatus = currentRun.status

          // 终态则关闭
          if (TERMINAL_STATUSES.includes(currentRun.status)) {
            controller.close()
            return
          }

          // 继续轮询
          setTimeout(poll, 1000)
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Internal error' })}\n\n`))
          controller.close()
        }
      }

      // 首次立即推送
      poll()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
