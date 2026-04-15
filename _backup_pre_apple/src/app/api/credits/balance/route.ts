/**
 * GET /api/credits/balance
 *
 * Returns the current user's credit balance, broken down by bucket.
 * Used by <CreditBalance> in the sidebar (polled every 30s) and by
 * any feature that wants to gate a paid action.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     total: number,
 *     bySource: {
 *       subscription: number,
 *       bonus: number,
 *       topup: number
 *     }
 *   }
 *
 * 401 if not signed in.  All ledger reads scoped to the caller's
 * Supabase user_id (resolved via getOrCreateCurrentUser → bridges
 * Clerk → public.users on first sight).
 */
import { NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import { getBalance } from '@/lib/creditLedger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  let user
  try {
    user = await getOrCreateCurrentUser()
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `auth_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'unauthenticated' },
      { status: 401 },
    )
  }

  try {
    const balance = await getBalance(supabaseService(), user.id)
    return NextResponse.json({
      ok: true,
      total: balance.total,
      bySource: balance.bySource,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `balance_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}
