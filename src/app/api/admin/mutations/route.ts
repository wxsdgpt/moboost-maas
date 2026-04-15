/**
 * API: /api/admin/mutations
 *
 * GET    — List mutations (pending / history / changelog)
 * POST   — Trigger PCEC cycle
 * PATCH  — Confirm or rollback a mutation
 */

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { evolution } from '@/agents/evolution'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'pending'

  switch (view) {
    case 'pending': {
      const mutations = await evolution.getPendingMutations()
      return NextResponse.json({ ok: true, mutations })
    }

    case 'history': {
      const target = searchParams.get('target') || undefined
      const status = searchParams.get('status') || undefined
      const limit = parseInt(searchParams.get('limit') || '50', 10)
      const mutations = await evolution.getMutationHistory({ target, status, limit })
      return NextResponse.json({ ok: true, mutations })
    }

    case 'changelog': {
      const category = searchParams.get('category') || undefined
      const level = searchParams.get('level') || undefined
      const limit = parseInt(searchParams.get('limit') || '100', 10)
      const entries = await evolution.getChangelog({ category, level, limit })
      return NextResponse.json({ ok: true, entries })
    }

    case 'candidates': {
      const status = searchParams.get('status') || 'discovered,abstracted,scored,approved,building'
      const candidates = await evolution.getCandidatesByStatus(status.split(','))
      return NextResponse.json({ ok: true, candidates })
    }

    case 'pcec': {
      const status = evolution.getPCECStatus()
      return NextResponse.json({ ok: true, status })
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown view: ${view}` }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { action, periodDays } = body as { action?: string; periodDays?: number }

    if (action === 'pcec' || !action) {
      const result = await evolution.runPCEC(periodDays || 7)
      return NextResponse.json({ ok: true, result })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { mutationId, action } = (await req.json()) as {
      mutationId: string
      action: 'confirm' | 'rollback'
    }

    if (!mutationId || !action) {
      return NextResponse.json({ ok: false, error: 'Missing mutationId or action' }, { status: 400 })
    }

    if (action === 'confirm') {
      const ok = await evolution.confirmMutation(mutationId, 'admin')
      return NextResponse.json({ ok })
    }

    if (action === 'rollback') {
      const ok = await evolution.rollbackMutation(mutationId)
      return NextResponse.json({ ok })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
