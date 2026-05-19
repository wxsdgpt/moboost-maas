/**
 * GET    /api/workflows/[id]  — 获取工作流详情
 * PUT    /api/workflows/[id]  — 更新工作流（保存画布）
 * DELETE /api/workflows/[id]  — 删除工作流
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { validateGraph } from '@/lib/workflowGraph'
import type { WorkflowGraph } from '@/lib/workflowTypes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = supabaseService()

  const { data, error } = await db
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  }

  // 检查权限：只能看自己的或模板
  if (data.created_by !== user.clerkUserId && !data.is_template) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ workflow: data })
}

export async function PUT(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: { name?: string; description?: string; graph?: WorkflowGraph }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const db = supabaseService()

  // 检查所有权
  const { data: existing } = await db
    .from('workflows')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  if (existing.created_by !== user.clerkUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 如果更新了 graph，校验合法性
  if (body.graph) {
    const validation = validateGraph(body.graph)
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Invalid workflow graph',
        details: validation.errors,
      }, { status: 400 })
    }
  }

  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updateFields.name = body.name.trim()
  if (body.description !== undefined) updateFields.description = body.description
  if (body.graph !== undefined) updateFields.graph = body.graph

  const { data, error } = await db
    .from('workflows')
    .update(updateFields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ workflow: data })
}

export async function DELETE(req: Request, { params }: Params) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = supabaseService()

  // 检查所有权
  const { data: existing } = await db
    .from('workflows')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  if (existing.created_by !== user.clerkUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db.from('workflows').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
