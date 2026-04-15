/**
 * Market-intel sync runner.
 *
 * Iterates every supported vertical, asks the active provider for a
 * VerticalIntel snapshot, upserts into public.market_intel keyed by
 * (vertical, source).
 *
 * Provider selection:
 *   1. If INSIGHTRACKR_API_KEY is set → use InsightrackrProvider (official API).
 *   2. If fixture JSONs exist in data/insightrackr/ → use InsightrackrScrapedProvider (real data, no API).
 *   3. Otherwise → fall back to MockMarketIntelProvider.
 *   4. If a real provider call throws, the runner falls through the chain
 *      so partial outages don't zero out our intel cache.
 *
 * Safety:
 *   - Each vertical is isolated: one failure never stops the rest.
 *   - Runner is idempotent: calling it twice in a row just refreshes
 *     the snapshots.
 *   - No user context here — this is shared reference data.
 */
import { supabaseService } from '@/lib/db'
import {
  computeFreshnessScore,
  SUPPORTED_VERTICALS,
  type MarketIntelProvider,
  type Vertical,
  type VerticalIntel,
} from './types'
import { MockMarketIntelProvider } from './providers/mock'
import { InsightrackrProvider } from './providers/insightrackr'
import { InsightrackrScrapedProvider } from './providers/insightrackrScraped'
import { logEvent } from '@/lib/eventLog'

export type VerticalSyncResult = {
  vertical: Vertical
  source: string
  ok: boolean
  freshnessScore: number
  error?: string
  fellBackToMock: boolean
}

export type SyncSummary = {
  startedAt: string
  finishedAt: string
  primaryProvider: string
  results: VerticalSyncResult[]
  okCount: number
  failCount: number
}

function pickPrimary(): MarketIntelProvider {
  // 1. Official API (highest fidelity)
  if (InsightrackrProvider.isConfigured()) {
    return new InsightrackrProvider()
  }
  // 2. Scraped fixtures (real data, no API dependency)
  if (InsightrackrScrapedProvider.isConfigured()) {
    return new InsightrackrScrapedProvider()
  }
  // 3. Mock (deterministic, always available)
  return new MockMarketIntelProvider()
}

export async function syncMarketIntel(): Promise<SyncSummary> {
  const startedAt = new Date().toISOString()
  const primary = pickPrimary()
  const mock = new MockMarketIntelProvider()
  const db = supabaseService()
  const results: VerticalSyncResult[] = []

  for (const vertical of SUPPORTED_VERTICALS) {
    let intel: VerticalIntel | null = null
    let source = primary.name
    let fellBackToMock = false
    let error: string | undefined

    // 1. Try primary.
    try {
      intel = await primary.fetchVerticalIntel(vertical)
    } catch (err) {
      error = (err as Error).message
    }

    // 2. Fall back to mock if primary failed and primary isn't already mock.
    if (!intel && primary.name !== mock.name) {
      try {
        intel = await mock.fetchVerticalIntel(vertical)
        source = mock.name
        fellBackToMock = true
      } catch (err) {
        // Mock should never fail, but be defensive.
        error = `${error ?? ''} | mock_fallback_failed: ${(err as Error).message}`.trim()
      }
    }

    if (!intel) {
      results.push({
        vertical,
        source,
        ok: false,
        freshnessScore: 0,
        error: error ?? 'unknown',
        fellBackToMock,
      })
      continue
    }

    const freshnessScore = computeFreshnessScore(intel)

    const upsert = await db
      .from('market_intel')
      .upsert(
        {
          vertical,
          source,
          snapshot_date: intel.generatedAt,
          payload: intel as unknown as Record<string, unknown>,
          freshness_score: freshnessScore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'vertical,source' },
      )

    if (upsert.error) {
      results.push({
        vertical,
        source,
        ok: false,
        freshnessScore,
        error: `db_upsert: ${upsert.error.message}`,
        fellBackToMock,
      })
      continue
    }

    results.push({
      vertical,
      source,
      ok: true,
      freshnessScore,
      fellBackToMock,
    })
  }

  const finishedAt = new Date().toISOString()

  logEvent('market_intel_synced', null, {
    provider: primary.name,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
    verticals: results.map((r) => r.vertical),
  })

  return {
    startedAt,
    finishedAt,
    primaryProvider: primary.name,
    results,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
  }
}
