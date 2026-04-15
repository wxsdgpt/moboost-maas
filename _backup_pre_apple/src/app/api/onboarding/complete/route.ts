/**
 * POST /api/onboarding/complete
 *
 * Body:
 *   {
 *     productName:    string
 *     productUrl?:    string
 *     vertical?:      string
 *     description?:   string
 *   }
 *
 * Side effects (all idempotent — safe to retry):
 *   1. Lazy-create the user's row in public.users via getOrCreateCurrentUser.
 *   2. Insert one row into public.products with the captured info.
 *   3. Grant 50 demo bonus credits via grantBonusIfAbsent (note keyed so
 *      a refresh / double-submit never doubles up).
 *   4. Stamp users.onboarded_at = now() and users.product_info = body.
 *
 * Returns:
 *   { ok: true, alreadyOnboarded: boolean, productId: string, bonusGranted: boolean }
 *
 * Why a single endpoint instead of step-by-step?  The form is short
 * (1 page) and all the work is cheap, so the simplest reliable shape
 * is "submit the whole thing once, server does everything atomically-ish".
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import { grantBonusIfAbsent } from '@/lib/creditLedger'
import { logEvent } from '@/lib/eventLog'

export const runtime = 'nodejs'

const SIGNUP_BONUS_AMOUNT = 50
const SIGNUP_BONUS_NOTE = 'signup demo bonus (50)'

type Body = {
  productName?: unknown
  productUrl?: unknown
  vertical?: unknown
  description?: unknown
}

function asString(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export async function POST(req: NextRequest) {
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

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    )
  }

  const productUrl = asString(body.productUrl, 500)
  if (!productUrl) {
    return NextResponse.json(
      { ok: false, error: 'product_url_required' },
      { status: 400 },
    )
  }
  if (!/^https?:\/\//i.test(productUrl)) {
    return NextResponse.json(
      { ok: false, error: 'product_url_invalid' },
      { status: 400 },
    )
  }
  // Product name is optional now — fall back to the URL host so we
  // always have something searchable in the products table.
  const explicitName = asString(body.productName, 120)
  let productName = explicitName
  if (!productName) {
    try {
      productName = new URL(productUrl).hostname.replace(/^www\./, '')
    } catch {
      productName = productUrl.slice(0, 120)
    }
  }
  const vertical = asString(body.vertical, 80)
  const description = asString(body.description, 1000)

  const db = supabaseService()

  // 1. Idempotency check — if user already finished onboarding, just
  //    return success without re-running side effects.
  const existing = await db
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle()

  if (existing.error) {
    return NextResponse.json(
      { ok: false, error: `users_lookup: ${existing.error.message}` },
      { status: 500 },
    )
  }

  if (existing.data?.onboarded_at) {
    return NextResponse.json({
      ok: true,
      alreadyOnboarded: true,
      productId: null,
      bonusGranted: false,
    })
  }

  // 2. Insert product row.
  const productInsert = await db
    .from('products')
    .insert({
      user_id: user.id,
      name: productName,
      url: productUrl,
      description,
      category: vertical,
    })
    .select('id')
    .single()

  if (productInsert.error || !productInsert.data) {
    return NextResponse.json(
      {
        ok: false,
        error: `product_insert: ${productInsert.error?.message ?? 'no_data'}`,
      },
      { status: 500 },
    )
  }

  // 3. Idempotent demo bonus grant.
  let bonusGranted = false
  try {
    bonusGranted = await grantBonusIfAbsent(
      db,
      user.id,
      SIGNUP_BONUS_AMOUNT,
      SIGNUP_BONUS_NOTE,
    )
  } catch (err) {
    // Log but don't fail the whole onboarding — the user can still
    // top up later.  Phase 2 will surface this as a notification.
    console.error('[onboarding] grantBonusIfAbsent failed:', err)
  }

  // 4. Stamp user row with onboarded_at + structured product_info snapshot.
  const stamp = await db
    .from('users')
    .update({
      onboarded_at: new Date().toISOString(),
      product_info: {
        productName,
        productUrl,
        vertical,
        description,
      },
    })
    .eq('id', user.id)

  if (stamp.error) {
    return NextResponse.json(
      { ok: false, error: `users_update: ${stamp.error.message}` },
      { status: 500 },
    )
  }

  // 5. Fire-and-forget enrichment kickoff.  We don't block onboarding
  //    completion on this — the user lands on the home page instantly
  //    and the WelcomeBanner / product page can poll for status.  Any
  //    failure is captured into products.enrichment_status='failed' by
  //    the enrich route itself, so there's nothing to surface here.
  void kickoffEnrichment(productInsert.data.id).catch((err) => {
    console.error('[onboarding] enrichment kickoff failed:', err)
  })

  logEvent('onboarding_completed', user.id, {
    productId: productInsert.data.id,
    productName: productName,
    vertical: vertical,
    bonusGranted,
  })

  return NextResponse.json({
    ok: true,
    alreadyOnboarded: false,
    productId: productInsert.data.id,
    bonusGranted,
  })
}

/**
 * Fire-and-forget enrichment kickoff.
 *
 * We call buildEnrichment inline (not via an HTTP hop to /api/products/enrich)
 * so this works correctly in both local dev and production without relying
 * on the route being reachable from the server environment (e.g. Vercel
 * deployments where the public URL isn't known server-side).
 *
 * The work is intentionally detached from the request with `void` — the
 * client has already been told onboarding is complete by the time this
 * resolves.
 */
async function kickoffEnrichment(productId: string): Promise<void> {
  // Import lazily so the onboarding route doesn't pull the scraper +
  // OpenRouter module graph unless this path actually runs.
  const [{ scrapeUrl, AppStoreUrlError }, { buildEnrichment }] =
    await Promise.all([
      import('@/lib/urlScraper'),
      import('@/lib/productEnrichment'),
    ])
  const db = supabaseService()

  const loaded = await db
    .from('products')
    .select('id, url')
    .eq('id', productId)
    .maybeSingle()
  if (loaded.error || !loaded.data?.url) return

  await db
    .from('products')
    .update({ enrichment_status: 'running', enrichment_error: null })
    .eq('id', productId)

  try {
    const raw = await scrapeUrl(loaded.data.url)
    const enrichment = await buildEnrichment(raw)
    await db
      .from('products')
      .update({
        enrichment: enrichment as unknown as Record<string, unknown>,
        content_hash: raw.contentHash,
        enriched_at: new Date().toISOString(),
        enrichment_status: 'ready',
        enrichment_error: null,
      })
      .eq('id', productId)
  } catch (err) {
    const msg =
      err instanceof AppStoreUrlError
        ? err.message
        : `enrich_failed: ${(err as Error).message}`
    await db
      .from('products')
      .update({
        enrichment_status: 'failed',
        enrichment_error: msg.slice(0, 500),
      })
      .eq('id', productId)
  }
}
