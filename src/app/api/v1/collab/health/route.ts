/**
 * GET /api/v1/collab/health
 *
 * Liveness probe for collaborator integrations. Verifies the bearer
 * token is valid + active, returns the token's metadata so the caller
 * can confirm which identity they're authenticated as.
 */
import { NextResponse } from 'next/server'
import { requireCollabToken } from '@/lib/collabAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const tok = await requireCollabToken(req)
  if (tok instanceof NextResponse) return tok
  return NextResponse.json({
    ok: true,
    token: { id: tok.id, name: tok.name, prefix: tok.prefix },
    serverTime: new Date().toISOString(),
  })
}
