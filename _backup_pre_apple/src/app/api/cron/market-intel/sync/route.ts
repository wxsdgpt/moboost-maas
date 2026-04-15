/**
 * POST /api/cron/market-intel/sync
 * GET  /api/cron/market-intel/sync   (same body — Vercel Cron sends GETs)
 *
 * Refresh the market_intel table for every supported vertical.  Meant
 * to be called by a scheduled job, not by end users.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` OR a matching
 * `?secret=<CRON_SECRET>` query param.  If CRON_SECRET is unset in
 * the environment, the route refuses to run at all — this is a hard
 * failure, not a dev-mode shortcut, because a world-readable market-intel
 * refresh is a free abuse vector.
 *
 * Scheduling suggestions:
 *   - Vercel Cron: `{"path": "/api/cron/market-intel/sync", "schedule": "0 * * * *"}`
 *     (hourly) is plenty while we're on mock data.  Drop to every 15
 *     minutes once the real Insightrackr provider is wired up and rate
 *     limits are known.
 *   - Alternatively: Supabase pg_cron calling an Edge Function that
 *     hits this endpoint.  Same auth header.
 */
import { NextRequest, NextResponse } from 'next/server'
import { syncMarketIntel } from '@/lib/marketIntel/syncRunner'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — syncs all verticals serially

function checkAuth(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return { ok: false, reason: 'cron_secret_unset_on_server' }
  }
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''
  const qp = req.nextUrl.searchParams.get('secret') ?? ''
  if (bearer === secret || qp === secret) {
    return { ok: true }
  }
  return { ok: false, reason: 'invalid_cron_secret' }
}

async function handle(req: NextRequest) {
  const authCheck = checkAuth(req)
  if (!authCheck.ok) {
    return NextResponse.json(
      { ok: false, error: authCheck.reason },
      { status: 401 },
    )
  }

  try {
    const summary = await syncMarketIntel()
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `sync_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
