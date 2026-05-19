/**
 * POST /api/workflows/[id]/estimate — 预估积分消耗
 *
 * 返回 CreditEstimate（total + breakdown per node）
 * 用户确认后调用 /run 执行
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { estimateCredits, validateGraph } from '@/lib/workflowGraph'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { estimatedSceneCount?: number } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  const db = supabaseService()
  const { data: workflow } = await db
    .from('workflows')
    .select('graph, created_by, is_template')
    .eq('id', id)
    .single()

  if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  if (workflow.created_by !== user.clerkUserId && !workflow.is_template) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 校验图
  const validation = validateGraph(workflow.graph)
  if (!validation.valid) {
    return NextResponse.json({
      error: 'Invalid workflow graph',
      details: validation.errors,
    }, { status: 400 })
  }

  const estimate = estimateCredits(workflow.graph, body.estimatedSceneCount || 10)

  return NextResponse.json({
    estimate,
    warnings: validation.warnings,
  })
}
