/**
 * GET /api/projects — List user's projects
 * POST /api/projects — Create a new project
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const db = supabaseService()
  const { data: projects, error } = await db
    .from('projects')
    .select(`
      id, name, description, status, source, metadata, created_at, updated_at,
      product_id,
      products ( id, name, url, category, enrichment_status )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Counts of generated artifacts per project (single batched fetch each, then bucketed)
  const projectIds = (projects ?? []).map((p) => p.id as string)
  const counts: Record<string, { reports: number; landingPages: number; assets: number }> =
    Object.fromEntries(projectIds.map((id) => [id, { reports: 0, landingPages: 0, assets: 0 }]))

  if (projectIds.length > 0) {
    const [reportsRes, landingsRes, assetsRes] = await Promise.all([
      db.from('reports').select('project_id').in('project_id', projectIds),
      db.from('landing_pages').select('project_id').in('project_id', projectIds),
      db.from('project_assets').select('project_id').in('project_id', projectIds),
    ])
    for (const r of reportsRes.data ?? []) {
      const pid = (r as { project_id: string | null }).project_id
      if (pid && counts[pid]) counts[pid].reports++
    }
    for (const l of landingsRes.data ?? []) {
      const pid = (l as { project_id: string | null }).project_id
      if (pid && counts[pid]) counts[pid].landingPages++
    }
    for (const a of assetsRes.data ?? []) {
      const pid = (a as { project_id: string | null }).project_id
      if (pid && counts[pid]) counts[pid].assets++
    }
  }

  const enriched = (projects ?? []).map((p) => ({
    ...p,
    counts: counts[p.id as string] ?? { reports: 0, landingPages: 0, assets: 0 },
  }))

  return NextResponse.json({ ok: true, projects: enriched })
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = await req.json()
  const { name, productId, source = 'manual', description, metadata = {} } = body

  if (!name?.trim()) {
    return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })
  }

  const db = supabaseService()
  const { data, error } = await db
    .from('projects')
    .insert({
      user_id: user.id,
      product_id: productId || null,
      name: name.trim(),
      description: description?.trim() || null,
      source,
      metadata,
    })
    .select('id, name, status, source, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, project: data })
}
