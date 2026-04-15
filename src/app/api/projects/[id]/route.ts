/**
 * GET /api/projects/[id] — Get project details with all related data
 * PATCH /api/projects/[id] — Update project
 * DELETE /api/projects/[id] — Archive project (soft delete)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const db = supabaseService()

  // Fetch project with all related data in parallel
  const [projectRes, reportsRes, assetsRes, landingPagesRes, conversationsRes] = await Promise.all([
    db.from('projects')
      .select('*, products ( id, name, url, category, enrichment_status, enrichment )')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    db.from('reports')
      .select('id, kind, status, credits_charged, created_at, updated_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    db.from('project_assets')
      .select('id, type, prompt, url, thumbnail, model, dimensions, evaluation, status, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    db.from('landing_pages')
      // Include `html` so the read-only project view (RemoteProjectView)
      // can render an inline preview without an additional round-trip.
      .select('id, template_id, status, model, html, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    db.from('project_conversations')
      .select('id, role, content, intent, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: true })
      .limit(100),
  ])

  if (projectRes.error || !projectRes.data) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    project: projectRes.data,
    reports: reportsRes.data ?? [],
    assets: assetsRes.data ?? [],
    landingPages: landingPagesRes.data ?? [],
    conversations: conversationsRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.status !== undefined) updates.status = body.status
  if (body.metadata !== undefined) updates.metadata = body.metadata

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'no_updates' }, { status: 400 })
  }

  const db = supabaseService()
  const { data, error } = await db
    .from('projects')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, status, updated_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, project: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  // Soft delete — set status to 'archived'
  const db = supabaseService()
  const { error } = await db
    .from('projects')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
