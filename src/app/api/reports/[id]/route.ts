/**
 * GET /api/reports/[id]
 *
 * Load a single report by ID for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseService } from '@/lib/db'
import { AUTH_BYPASS } from '@/lib/authBypass'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = supabaseService()

  let userId: string | null = null
  if (AUTH_BYPASS) {
    // v1.0.2 test mode — skip user ownership check entirely
  } else {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: userRow, error: userErr } = await db
      .from('users')
      .select('id')
      .eq('clerk_user_id', clerkId)
      .maybeSingle()

    if (userErr) return NextResponse.json({ error: 'db_error', detail: userErr.message }, { status: 500 })
    if (!userRow) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    userId = userRow.id
  }

  const query = db
    .from('reports')
    .select('id, product_id, kind, status, output, credits_charged, created_at')
    .eq('id', params.id)
  const { data: report, error } = await (userId ? query.eq('user_id', userId) : query).maybeSingle()

  if (error || !report) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  return NextResponse.json({ report })
}
