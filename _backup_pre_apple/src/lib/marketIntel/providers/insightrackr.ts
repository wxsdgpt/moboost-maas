/**
 * Insightrackr MarketIntelProvider — STUB.
 *
 * Status: Insightrackr advertises an API but does not publish public
 * developer documentation.  Access requires a sales conversation to
 * get:
 *   - INSIGHTRACKR_API_KEY         (bearer token)
 *   - INSIGHTRACKR_API_BASE_URL    (e.g. https://api.insightrackr.com/v1)
 *   - Rate-limit / quota details
 *   - Actual endpoint paths + response shapes
 *
 * Until that lands, `isConfigured()` returns false and the sync runner
 * falls back to the mock provider.  When the creds arrive, fill in the
 * three TODO blocks below — do NOT change the output shape: every other
 * file in the pipeline relies on `VerticalIntel` as the contract.
 *
 * Expected rough mapping (to be confirmed against real docs):
 *   GET /advertisers?vertical=...&limit=10   → topAdvertisers
 *   GET /creatives/patterns?vertical=...     → creativePatterns
 *   GET /features/trending?vertical=...      → trendingFeatures
 *   GET /geo/hotspots?vertical=...           → geoHotspots
 */
import type {
  MarketIntelProvider,
  Vertical,
  VerticalIntel,
} from '../types'

const BASE_URL =
  process.env.INSIGHTRACKR_API_BASE_URL || 'https://api.insightrackr.com/v1'
const API_KEY = process.env.INSIGHTRACKR_API_KEY
const FETCH_TIMEOUT_MS = 20_000

export class InsightrackrProvider implements MarketIntelProvider {
  readonly name = 'insightrackr'

  static isConfigured(): boolean {
    return Boolean(API_KEY)
  }

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    if (!API_KEY) {
      throw new Error('INSIGHTRACKR_API_KEY_missing')
    }

    // TODO(insightrackr): replace with real endpoint calls once the
    // sales contract is signed and the docs are available.  Until
    // then we throw a clear error rather than silently returning
    // empty data — the sync runner catches this and falls back to
    // the mock provider.
    throw new Error(
      'InsightrackrProvider_not_implemented: waiting on API docs + key provisioning',
    )

    // Reference implementation for when it's ready:
    //
    // const [advertisers, creatives, features, geos] = await Promise.all([
    //   this.call('/advertisers', { vertical, limit: 10 }),
    //   this.call('/creatives/patterns', { vertical, limit: 10 }),
    //   this.call('/features/trending', { vertical }),
    //   this.call('/geo/hotspots', { vertical }),
    // ])
    //
    // return {
    //   vertical,
    //   source: this.name,
    //   generatedAt: new Date().toISOString(),
    //   topAdvertisers: mapAdvertisers(advertisers),
    //   creativePatterns: mapPatterns(creatives),
    //   trendingFeatures: mapFeatures(features),
    //   ctaPatterns: deriveCtasFromPatterns(creatives),
    //   geoHotspots: mapGeos(geos),
    //   coverageNote: `insightrackr live snapshot, ${advertisers.sampleSize ?? '?'} advertisers sampled`,
    // }
  }

  /**
   * Thin GET helper kept around so the real implementation above can
   * just call `this.call(...)`.  Intentionally unused until endpoints
   * are wired up.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async call(
    path: string,
    params: Record<string, string | number>,
  ): Promise<unknown> {
    const url = new URL(BASE_URL.replace(/\/$/, '') + path)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '<no body>')
        throw new Error(`insightrackr_${res.status}: ${body.slice(0, 200)}`)
      }
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }
}
