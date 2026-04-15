/**
 * GET /api/store/info  →  { ok: true, storage: StorageInfo }
 *
 * Diagnostic endpoint.  Returns the absolute on-disk path of the signed-in
 * user's projects directory, the file count, total bytes, schema version.
 * The UI uses this to display "💾 stored at: <path>".  Unauthenticated
 * callers get 401.
 */
import { NextResponse } from 'next/server'
import { getStorageInfo } from '@/lib/projectPersistence'
import { getClerkUserId } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const userId = await getClerkUserId()
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'unauthenticated', storage: null },
      { status: 401 },
    )
  }
  try {
    const storage = await getStorageInfo(userId)
    return NextResponse.json({ ok: true, storage })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
