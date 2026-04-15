/**
 * POST /api/projects/[id]/conversations — Add a message to a project's conversation
 *
 * This is used by the unified collector to save conversation messages.
 * Also triggers intent detection on user messages.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = await req.json()
  const { role, content, intent, metadata = {} } = body

  if (!role || !content?.trim()) {
    return NextResponse.json({ ok: false, error: 'role_and_content_required' }, { status: 400 })
  }

  const db = supabaseService()

  // Verify project belongs to user
  const { data: project } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ ok: false, error: 'project_not_found' }, { status: 404 })
  }

  const { data, error } = await db
    .from('project_conversations')
    .insert({
      project_id: projectId,
      user_id: user.id,
      role,
      content: content.trim(),
      intent: intent || null,
      metadata,
    })
    .select('id, role, content, intent, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, message: data })
}
