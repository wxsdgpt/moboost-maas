/**
 * POST /api/products/enrich
 *
 * Body:
 *   { productId: string }
 *
 * Runs the URL enrichment pipeline (scrape → deterministic extract →
 * optional LLM extract → merge) and writes the result back to
 * public.products.
 *
 * Idempotency / cache busting:
 *   - We re-scrape the URL every time so we get a fresh content_hash.
 *   - If the fresh content_hash matches the already-stored one AND we
 *     already have an enrichment record with status='ready', we skip
 *     the LLM pass entirely and return the cached result.
 *
 * Ownership:
 *   The route is authenticated via Clerk and the product must belong
 *   to the calling user (users.id == products.user_id).  We do the
 *   user lookup via getOrCreateCurrentUser().
 *
 * Failure modes:
 *   - auth → 401
 *   - missing productId / not found / not owned → 404
 *   - scrape failure (network, 4xx, payload too large, app store URL)
 *     → writes enrichment_status='failed' + enrichment_error, returns 200
 *     with { ok: false, status: 'failed', error }.  We *don't* 5xx here
 *     because a bad source URL is a user-data problem, not a server bug.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import { scrapeUrl, AppStoreUrlError } from '@/lib/urlScraper'
import { buildEnrichment } from '@/lib/productEnrichment'

export const runtime = 'nodejs'
export const maxDuration = 60

type Body = { productId?: unknown }

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
  const productId =
    typeof body.productId === 'string' ? body.productId.trim() : ''
  if (!productId) {
    return NextResponse.json(
      { ok: false, error: 'product_id_required' },
      { status: 400 },
    )
  }

  const db = supabaseService()

  // 1. Load product and verify ownership.
  const loaded = await db
    .from('products')
    .select(
      'id, user_id, url, enrichment, content_hash, enrichment_status',
    )
    .eq('id', productId)
    .maybeSingle()

  if (loaded.error) {
    return NextResponse.json(
      { ok: false, error: `product_lookup: ${loaded.error.message}` },
      { status: 500 },
    )
  }
  if (!loaded.data || loaded.data.user_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: 'product_not_found' },
      { status: 404 },
    )
  }
  const product = loaded.data
  if (!product.url) {
    return NextResponse.json(
      { ok: false, error: 'product_has_no_url' },
      { status: 400 },
    )
  }

  // 2. Mark running (best-effort — ignore errors).
  await db
    .from('products')
    .update({ enrichment_status: 'running', enrichment_error: null })
    .eq('id', productId)

  // 3. Scrape.
  let raw
  try {
    raw = await scrapeUrl(product.url)
  } catch (err) {
    const msg =
      err instanceof AppStoreUrlError
        ? err.message
        : `scrape_failed: ${(err as Error).message}`
    await db
      .from('products')
      .update({
        enrichment_status: 'failed',
        enrichment_error: msg.slice(0, 500),
      })
      .eq('id', productId)
    return NextResponse.json({
      ok: false,
      status: 'failed',
      error: msg,
    })
  }

  // 4. Cache short-circuit: same content hash + already-ready → done.
  if (
    product.enrichment_status === 'ready' &&
    product.content_hash &&
    product.content_hash === raw.contentHash &&
    product.enrichment
  ) {
    return NextResponse.json({
      ok: true,
      status: 'ready',
      cached: true,
      enrichment: product.enrichment,
    })
  }

  // 5. Run enrichment pipeline.
  let enrichment
  try {
    enrichment = await buildEnrichment(raw)
  } catch (err) {
    const msg = `enrich_failed: ${(err as Error).message}`
    await db
      .from('products')
      .update({
        enrichment_status: 'failed',
        enrichment_error: msg.slice(0, 500),
      })
      .eq('id', productId)
    return NextResponse.json({
      ok: false,
      status: 'failed',
      error: msg,
    })
  }

  // 6. Persist.
  const saved = await db
    .from('products')
    .update({
      enrichment: enrichment as unknown as Record<string, unknown>,
      content_hash: raw.contentHash,
      enriched_at: new Date().toISOString(),
      enrichment_status: 'ready',
      enrichment_error: null,
    })
    .eq('id', productId)

  if (saved.error) {
    return NextResponse.json(
      { ok: false, error: `product_update: ${saved.error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    status: 'ready',
    cached: false,
    enrichment,
  })
}
