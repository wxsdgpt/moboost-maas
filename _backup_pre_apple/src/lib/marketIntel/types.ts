/**
 * Market intel — provider-agnostic shape.
 *
 * Why an abstraction?  Phase 1 ships with a deterministic mock provider
 * so downstream generation (marketing recommendations) isn't blocked on
 * a third-party sales cycle.  When an Insightrackr API key + endpoint
 * become available, the only thing that changes is which MarketIntelProvider
 * the sync runner instantiates.  All downstream code (read helpers,
 * recommendation generator) reads the same `VerticalIntel` shape out
 * of `public.market_intel`.
 *
 * Invariants every provider must uphold:
 *   - Same `vertical` string in → same canonical shape out.
 *   - Missing data is represented as empty arrays / nulls, never as
 *     placeholder strings like "N/A".
 *   - `generatedAt` MUST be the provider's own timestamp, so we can
 *     tell stale snapshots apart from fresh ones in the DB.
 */

/** 10 iGaming verticals currently supported by the onboarding form. */
export const SUPPORTED_VERTICALS = [
  'Sports Betting',
  'Casino',
  'Slots',
  'Poker',
  'Lottery',
  'Esports',
  'Fantasy Sports',
  'Bingo',
  'Live Dealer',
  'Crash Games',
] as const

export type Vertical = (typeof SUPPORTED_VERTICALS)[number]

export function isSupportedVertical(v: string): v is Vertical {
  return (SUPPORTED_VERTICALS as readonly string[]).includes(v)
}

/** Compact top-advertiser record.  Stable across providers. */
export type TopAdvertiser = {
  name: string
  /** Where this advertiser's activity is mostly seen. */
  topChannels: string[]
  /** 0-100 share-of-voice proxy within the vertical. */
  shareOfVoice: number
  /** ISO-3166 alpha-2 country codes this advertiser targets. */
  topGeos: string[]
}

/** One trending creative pattern — NOT a single creative asset. */
export type CreativePattern = {
  /** Short label we can show in the UI ("Welcome bonus countdown"). */
  label: string
  /** Format bucket. */
  format: 'video' | 'static' | 'playable' | 'carousel' | 'html5' | 'unknown'
  /** 0-100 frequency of this pattern within the sampled vertical. */
  frequency: number
  /** Typical hook / opening beat we see in samples. */
  hookPattern: string
  /** Top CTAs that accompany this pattern. */
  ctas: string[]
}

/** Geographic signal within a vertical. */
export type GeoHotspot = {
  /** ISO-3166 alpha-2 code. */
  country: string
  /** Why it's hot: short phrase, e.g. "rising SOV", "new regulation". */
  reason: string
  /** 0-100 relative weight. */
  weight: number
}

/** The canonical "market intel snapshot" for one vertical from one source. */
export type VerticalIntel = {
  vertical: Vertical
  /** Short human label for the source: "insightrackr", "mock", etc. */
  source: string
  /** Provider's own "as of" timestamp (ISO). */
  generatedAt: string
  topAdvertisers: TopAdvertiser[]
  creativePatterns: CreativePattern[]
  trendingFeatures: string[]
  ctaPatterns: string[]
  geoHotspots: GeoHotspot[]
  /** Provider's own coverage notes — e.g. "sampled 500 creatives from 48 advertisers". */
  coverageNote: string | null
}

export interface MarketIntelProvider {
  /** Stable identifier written to market_intel.source. */
  readonly name: string
  fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel>
}

/**
 * Compute a 0-1 freshness/quality score from a VerticalIntel.
 *
 * The downstream recommendation generator uses this to decide whether
 * to trust a snapshot wholesale or prompt the LLM to "treat the intel
 * as directional only".  Cheap to compute, not a replacement for
 * actual review.
 */
export function computeFreshnessScore(intel: VerticalIntel): number {
  const checks = [
    intel.topAdvertisers.length >= 3 ? 1 : intel.topAdvertisers.length / 3,
    intel.creativePatterns.length >= 3 ? 1 : intel.creativePatterns.length / 3,
    intel.trendingFeatures.length >= 3 ? 1 : intel.trendingFeatures.length / 3,
    intel.ctaPatterns.length >= 2 ? 1 : intel.ctaPatterns.length / 2,
    intel.geoHotspots.length >= 2 ? 1 : intel.geoHotspots.length / 2,
  ]
  const avg = checks.reduce((a, b) => a + b, 0) / checks.length
  return Math.max(0, Math.min(1, avg))
}
