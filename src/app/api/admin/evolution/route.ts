/**
 * API: /api/admin/evolution
 *
 * GET  — Fetch goals, verifications, evolution score
 */

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import {
  getActiveGoals,
  getPendingVerifications,
  measureGoals,
  computeEvolutionScore,
  initializeGoals,
} from '@/agents/evolution/goals'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'goals'

  switch (view) {
    case 'goals': {
      await initializeGoals()
      const goals = await getActiveGoals()
      return NextResponse.json({ ok: true, goals })
    }

    case 'verifications': {
      const sb = supabaseService()
      const { data, error } = await sb
        .from('evolution_verifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        return NextResponse.json({ ok: true, verifications: [] })
      }

      const verifications = (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        mutationId: row.mutation_id as string,
        verdict: row.verdict as string,
        verdictReason: row.verdict_reason as string,
        autoRollbackTriggered: row.auto_rollback_triggered as boolean,
        verifiedAt: row.verified_at as string | null,
        createdAt: row.created_at as string,
      }))

      return NextResponse.json({ ok: true, verifications })
    }

    case 'score': {
      await initializeGoals()
      const goals = await getActiveGoals()
      const metrics = await measureGoals()
      const score = computeEvolutionScore(goals, metrics)
      return NextResponse.json({ ok: true, score, metrics })
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown view: ${view}` }, { status: 400 })
  }
}
