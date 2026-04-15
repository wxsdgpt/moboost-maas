/**
 * Shared helper: resolve (or auto-create) the default project for a given
 * user + product, so any generated artifact (report, landing page, asset)
 * can be stamped with a stable project_id.
 *
 * Resolution order:
 *   1. If `override` project_id is supplied AND owned by the user → use it.
 *   2. Most recently-created project for (user_id, product_id) → use it.
 *   3. Otherwise create a new project, source='auto', and return its id.
 *
 * Returns null only if all attempts fail (logged, non-fatal — caller may
 * still proceed with project_id=null and the row will be picked up by the
 * orphan backfill / global lists).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveProjectId(
  db: SupabaseClient,
  userId: string,
  productId: string,
  override: string | null | undefined,
  productName: string,
  reason: string = 'auto',
): Promise<string | null> {
  if (override) {
    const owned = await db
      .from('projects')
      .select('id')
      .eq('id', override)
      .eq('user_id', userId)
      .maybeSingle()
    if (owned.data?.id) return owned.data.id as string
  }

  const byProduct = await db
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (byProduct.data?.id) return byProduct.data.id as string

  const created = await db
    .from('projects')
    .insert({
      user_id: userId,
      product_id: productId,
      name: productName,
      source: 'auto',
      metadata: { auto_created: true, reason },
    })
    .select('id')
    .single()

  if (created.error) {
    console.error('[projectResolver] auto-create failed:', created.error.message)
    return null
  }
  return created.data?.id ?? null
}
