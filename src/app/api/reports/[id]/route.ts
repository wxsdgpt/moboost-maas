/**
 * GET /api/reports/[id]
 *
 * Load a single report by ID for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseService } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = supabaseService()

  const { data: userRow, error: userErr } = await db
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkId)
    .maybeSingle()

  if (userErr) return NextResponse.json({ error: 'db_error', detail: userErr.message }, { status: 500 })
  if (!userRow) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

  const { data: report, error } = await db
    .from('reports')
    .select('id, product_id, kind, status, output, credits_charged, created_at')
    .eq('id', params.id)
    .eq('user_id', userRow.id)
    .maybeSingle()

  if (error || !report) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  return NextResponse.json({ report })
}
