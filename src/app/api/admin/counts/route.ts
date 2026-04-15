/**
 * GET /api/admin/counts
 *
 * Returns global row counts for ALL tables — no auth required.
 * Also returns a list of all registered users.
 */
import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = supabaseService()

    const [users, products, reports, landingPages, credits, subscriptions, events, marketIntel] = await Promise.all([
      db.from('users').select('id, clerk_user_id, email, created_at, onboarded_at'),
      db.from('products').select('id', { count: 'exact', head: true }),
      db.from('reports').select('id', { count: 'exact', head: true }),
      db.from('landing_pages').select('id', { count: 'exact', head: true }),
      db.from('credit_ledger').select('id', { count: 'exact', head: true }),
      db.from('subscriptions').select('id', { count: 'exact', head: true }),
      db.from('event_log').select('id', { count: 'exact', head: true }),
      db.from('market_intel').select('id', { count: 'exact', head: true }),
    ])

    if (users.error) return NextResponse.json({ ok: false, error: users.error.message }, { status: 500 })
    if (products.error) return NextResponse.json({ ok: false, error: products.error.message }, { status: 500 })
    if (reports.error) return NextResponse.json({ ok: false, error: reports.error.message }, { status: 500 })
    if (landingPages.error) return NextResponse.json({ ok: false, error: landingPages.error.message }, { status: 500 })
    if (credits.error) return NextResponse.json({ ok: false, error: credits.error.message }, { status: 500 })
    if (subscriptions.error) return NextResponse.json({ ok: false, error: subscriptions.error.message }, { status: 500 })
    if (events.error) return NextResponse.json({ ok: false, error: events.error.message }, { status: 500 })
    if (marketIntel.error) return NextResponse.json({ ok: false, error: marketIntel.error.message }, { status: 500 })

    return NextResponse.json({
      counts: {
        users: users.data?.length ?? 0,
        products: products.count ?? 0,
        reports: reports.count ?? 0,
        landing_pages: landingPages.count ?? 0,
        credit_ledger: credits.count ?? 0,
        subscriptions: subscriptions.count ?? 0,
        events: events.count ?? 0,
        market_intel: marketIntel.count ?? 0,
      },
      users: (users.data || []).map(u => ({
        id: u.id,
        clerkId: u.clerk_user_id,
        email: u.email,
        createdAt: u.created_at,
        onboarded: !!u.onboarded_at,
      })),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
