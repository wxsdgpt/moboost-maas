/**
 * GET /api/store/restore  → { ok: true, projects: ProjectRecord[] }
 *
 * Returns every persisted project belonging to the signed-in Clerk user
 * from <DATA_DIR>/users/<userId>/projects/*.json.  Called once on app boot
 * from the client store's `hydrate()` helper.  Unauthenticated callers
 * get 401 with an empty projects list so the client can gracefully show
 * the anon/empty state instead of crashing.
 */
import { NextResponse } from 'next/server'
import {
  restoreAllProjectsFromDisk,
  getStorageInfo,
} from '@/lib/projectPersistence'
import { getClerkUserId } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const userId = await getClerkUserId()
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthenticated',
        projects: [],
        storage: null,
      },
      { status: 401 },
    )
  }
  try {
    const [projects, info] = await Promise.all([
      restoreAllProjectsFromDisk(userId),
      getStorageInfo(userId),
    ])
    return NextResponse.json({
      ok: true,
      projects,
      storage: info,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
