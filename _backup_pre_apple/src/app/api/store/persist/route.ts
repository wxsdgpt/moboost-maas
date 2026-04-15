/**
 * POST   /api/store/persist   { project: ProjectRecord }   → write one
 * DELETE /api/store/persist?projectId=<id>                  → delete one
 *
 * Single-write endpoint.  Phase 1.5: writes are scoped by Clerk userId —
 * every persist / delete lands under <DATA_DIR>/users/<userId>/projects/
 * rather than the shared top-level projects dir.  Unauthenticated callers
 * get 401.
 *
 * See `src/lib/projectPersistence.ts` for the on-disk layout, atomic write
 * strategy, and schema-version handling.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  persistProjectToDisk,
  deleteProjectFromDisk,
} from '@/lib/projectPersistence'
import { requireClerkUserId } from '@/lib/auth'
import type { ProjectRecord } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await requireClerkUserId()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'unauthenticated' },
      { status: 401 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    )
  }
  const project = body?.project as ProjectRecord | undefined
  if (!project || typeof project.id !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'missing_or_malformed_project' },
      { status: 400 },
    )
  }
  try {
    const writtenPath = await persistProjectToDisk(userId, project)
    return NextResponse.json({ ok: true, path: writtenPath })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  let userId: string
  try {
    userId = await requireClerkUserId()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'unauthenticated' },
      { status: 401 },
    )
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: 'missing projectId query param' },
      { status: 400 },
    )
  }
  try {
    await deleteProjectFromDisk(userId, projectId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
