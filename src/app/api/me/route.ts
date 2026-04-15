/**
 * GET /api/me
 *
 * Returns the lightweight "who am I + what did I tell you" payload
 * the home page uses to render the welcome banner and short-cuts.
 *
 * Response:
 *   {
 *     ok: true,
 *     userId: string,           // internal Supabase uuid
 *     email: string | null,
 *     onboardedAt: string | null,
 *     productInfo: {
 *       productName: string | null,
 *       productUrl: string | null,
 *       vertical: string | null,
 *       description: string | null,
 *     } | null
 *   }
 *
 * Returns 401 if not signed in (the home page handles this gracefully
 * by just rendering the unauth state).
 */
import { NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'

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

  const db = supabaseService()
  const row = await db
    .from('users')
    .select('onboarded_at, product_info')
    .eq('id', user.id)
    .maybeSingle()

  if (row.error) {
    return NextResponse.json(
      { ok: false, error: `users_lookup: ${row.error.message}` },
      { status: 500 },
    )
  }

  // Fetch the user's primary product (most recent)
  const productRow = await db
    .from('products')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (productRow.error) {
    return NextResponse.json(
      { ok: false, error: `products_lookup: ${productRow.error.message}` },
      { status: 500 },
    )
  }

  const productId = productRow.data?.id ?? null

  // Fetch the user's default project: prefer the one tied to their primary
  // product; fall back to the most-recently-touched project.
  let defaultProjectId: string | null = null
  if (productId) {
    const byProduct = await db
      .from('projects')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    defaultProjectId = byProduct.data?.id ?? null
  }
  if (!defaultProjectId) {
    const anyProj = await db
      .from('projects')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    defaultProjectId = anyProj.data?.id ?? null
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    onboardedAt: row.data?.onboarded_at ?? null,
    productInfo: row.data?.product_info ?? null,
    productId,
    defaultProjectId,
  })
}
