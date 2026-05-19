/**
 * GET  /api/workflows        — 列表（?template=true 筛选模板）
 * POST /api/workflows        — 创建工作流
 */

import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { validateGraph } from '@/lib/workflowGraph'
import type { WorkflowGraph } from '@/lib/workflowTypes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const templateOnly = url.searchParams.get('template') === 'true'

  const db = supabaseService()
  let query = db.from('workflows').select('*')

  if (templateOnly) {
    query = query.eq('is_template', true)
  } else {
    query = query.or(`created_by.eq.${user.clerkUserId},is_template.eq.true`)
  }

  query = query.order('updated_at', { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ workflows: data })
}

export async function POST(req: Request) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string; description?: string; graph?: WorkflowGraph; templateKey?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, description, graph, templateKey } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return NextResponse.json({ error: 'graph must have nodes[] and edges[]' }, { status: 400 })
  }

  // 校验图合法性
  const validation = validateGraph(graph)
  if (!validation.valid) {
    return NextResponse.json({
      error: 'Invalid workflow graph',
      details: validation.errors,
    }, { status: 400 })
  }

  const db = supabaseService()
  const { data, error } = await db
    .from('workflows')
    .insert({
      name: name.trim(),
      description: description || null,
      graph,
      template_key: templateKey || null,
      is_template: false,
      created_by: user.clerkUserId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ workflow: data }, { status: 201 })
}
