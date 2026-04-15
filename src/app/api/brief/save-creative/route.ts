/**
 * POST /api/brief/save-creative
 *
 * Persists an image/video creative produced by the brief/execute flow into
 * `project_assets`. The generation itself happens in the unauthenticated
 * `/api/generate` and `/api/generate-video` routes (they are pure
 * model-proxy endpoints), so this companion route is what gives the
 * resulting bytes a permanent home and ties them back to the report that
 * triggered them.
 *
 * Why a separate route: keeping `/api/generate` stateless lets non-brief
 * callers (e.g. one-off tool playgrounds) use it without dragging in
 * project/report ownership semantics. The brief/execute client knows the
 * (reportId, projectId, audienceTag, region, prompt) tuple and calls this
 * endpoint after generation succeeds.
 *
 * Auth: requires a signed-in user. Validates that BOTH the report and the
 * project belong to the caller before inserting — prevents writing an
 * asset under someone else's report by ID forgery.
 *
 * Returns: { ok: true, asset: { id, ... } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  reportId?: unknown
  type?: unknown            // 'image' | 'video'
  url?: unknown             // data: URL or hosted URL
  thumbnail?: unknown
  prompt?: unknown
  model?: unknown
  audienceTag?: unknown
  region?: unknown
}

function s(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })

  const reportId = s(body.reportId)
  const type = s(body.type)
  const url = s(body.url)

  if (!reportId || !type || !url) {
    return NextResponse.json(
      { ok: false, error: 'missing_fields', detail: 'reportId, type, url required' },
      { status: 400 },
    )
  }
  if (type !== 'image' && type !== 'video') {
    return NextResponse.json({ ok: false, error: 'invalid_type' }, { status: 400 })
  }

  const db = supabaseService()

  // Derive projectId from the report — single source of truth, and the
  // ownership check on the report row also gates the project link. This
  // prevents a forged request from attaching assets under another user's
  // report or against a project the caller doesn't own.
  const { data: reportRow, error: reportErr } = await db
    .from('reports')
    .select('id, project_id')
    .eq('id', reportId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (reportErr || !reportRow) {
    return NextResponse.json({ ok: false, error: 'report_not_found' }, { status: 404 })
  }
  const projectId = reportRow.project_id
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: 'report_has_no_project', detail: 'report row missing project_id; run migration 0015 backfill' },
      { status: 409 },
    )
  }

  const { data, error } = await db
    .from('project_assets')
    .insert({
      project_id: projectId,
      report_id: reportId,
      user_id: user.id,
      type,
      url,
      thumbnail: s(body.thumbnail),
      prompt: s(body.prompt),
      model: s(body.model),
      audience_tag: s(body.audienceTag),
      region: s(body.region),
      status: 'done',
    })
    .select('id, type, url, thumbnail, prompt, model, audience_tag, region, created_at')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, asset: data })
}
