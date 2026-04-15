/**
 * Read path for market intel snapshots.
 *
 * Downstream consumers (marketing recommendation generator, UI cards,
 * etc.) should use these helpers instead of querying market_intel
 * directly so we can cache, fan out to multiple sources, or swap the
 * storage layer later without changing callers.
 */
import { supabaseService } from '@/lib/db'
import {
  isSupportedVertical,
  type Vertical,
  type VerticalIntel,
} from './types'

export type VerticalIntelRecord = {
  vertical: Vertical
  source: string
  snapshotDate: string
  freshnessScore: number
  intel: VerticalIntel
}

/**
 * Return the freshest snapshot we have for the given vertical, across
 * any source.  Prefers higher freshness_score then newer snapshot_date.
 *
 * Returns null if no snapshot exists — caller should treat that as
 * "never synced yet, trigger a sync or degrade gracefully".
 */
export async function getVerticalIntel(
  vertical: string,
): Promise<VerticalIntelRecord | null> {
  if (!isSupportedVertical(vertical)) return null

  const db = supabaseService()
  const { data, error } = await db
    .from('market_intel')
    .select('vertical, source, snapshot_date, payload, freshness_score')
    .eq('vertical', vertical)
    .order('freshness_score', { ascending: false })
    .order('snapshot_date', { ascending: false })
    .limit(1)

  if (error) {
    // Gracefully degrade if table doesn't exist yet (schema cache miss)
    // or any other read error — market intel is enrichment, not critical path
    return null
  }
  if (!data || data.length === 0) return null

  const row = data[0]
  return {
    vertical: row.vertical as Vertical,
    source: row.source,
    snapshotDate: row.snapshot_date,
    freshnessScore: row.freshness_score,
    intel: row.payload as unknown as VerticalIntel,
  }
}

/**
 * Bulk variant — returns the freshest snapshot for each requested
 * vertical.  Missing verticals are simply absent from the result map.
 */
export async function getVerticalIntelBulk(
  verticals: string[],
): Promise<Record<string, VerticalIntelRecord>> {
  const out: Record<string, VerticalIntelRecord> = {}
  for (const v of verticals) {
    const rec = await getVerticalIntel(v)
    if (rec) out[v] = rec
  }
  return out
}
