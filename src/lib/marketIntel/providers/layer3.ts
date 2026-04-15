/**
 * Layer 3 — Premium / paid data source providers.
 *
 * These providers connect to third-party APIs for deeper market
 * intelligence beyond what Insightrackr offers.  Each is gated behind
 * its own env var and integrates into the existing MarketIntelProvider
 * interface.
 *
 * ┌────────────────┬─────────────────────┬──────────────────────────────┐
 * │  Source         │  Env Key            │  What it adds                │
 * ├────────────────┼─────────────────────┼──────────────────────────────┤
 * │ SimilarWeb     │ SIMILARWEB_API_KEY  │ Traffic estimates, referral  │
 * │                │                     │ sources, audience geo split  │
 * │ SpyFu / SEMrush│ SPYFU_API_KEY       │ Paid keywords, ad copy       │
 * │ AppFollow      │ APPFOLLOW_API_KEY   │ App store intelligence       │
 * │ SocialBlade    │ SOCIALBLADE_API_KEY │ Social channel growth rates  │
 * └────────────────┴─────────────────────┴──────────────────────────────┘
 *
 * FREE ALTERNATIVES (for demo / bootstrap phase):
 *
 * 1. Traffic estimation:
 *    - Tranco list (free, updated daily) — domain ranking
 *    - CommonCrawl (free, CC license) — rough traffic proxy
 *    - CrUX (Chrome UX Report, free via BigQuery) — real user metrics
 *
 * 2. Ad intelligence:
 *    - Meta Ad Library API (free) — active Facebook/Instagram ads
 *    - Google Ads Transparency Center (free, no API yet)
 *    - We already have Insightrackr (Layer 2)
 *
 * 3. App store data:
 *    - Google Play scraping (via google-play-scraper npm)
 *    - Apple App Store (itunes.apple.com/lookup API, free)
 *
 * 4. Social metrics:
 *    - YouTube Data API v3 (free quota: 10k units/day)
 *    - Twitter/X API v2 (free basic tier: 500k tweets/month read)
 *
 * 5. SEO / Keywords:
 *    - Google Search Console API (free, owner access)
 *    - Google Trends API (unofficial but stable)
 *    - Ubersuggest free tier (limited)
 *
 * Integration approach:
 *   Each free source becomes a FreeIntelProvider that contributes
 *   partial data to enrich the VerticalIntel snapshot.  The sync runner
 *   merges all available sources using a waterfall:
 *     InsightrackrAPI > InsightrackrScraped > FreeIntel > Mock
 */

import type {
  MarketIntelProvider,
  Vertical,
  VerticalIntel,
} from '../types'

// ──────────────────────────────── Meta Ad Library (Free)

/**
 * Meta Ad Library provider — fetches active ads from Facebook/Instagram
 * ad library for iGaming brands.
 *
 * API: https://www.facebook.com/ads/library/api/
 * Rate limit: 200 requests/hour per access token
 * Cost: Free with a Meta developer account
 */
export class MetaAdLibraryProvider implements MarketIntelProvider {
  readonly name = 'meta-ad-library'

  static isConfigured(): boolean {
    return !!process.env.META_AD_LIBRARY_TOKEN
  }

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    const token = process.env.META_AD_LIBRARY_TOKEN
    if (!token) throw new Error('META_AD_LIBRARY_TOKEN not configured')

    // TODO: Implement when ready
    // 1. Search ads by iGaming brand keywords for this vertical
    // 2. Count active ads per advertiser → topAdvertisers SOV
    // 3. Analyze ad formats → creativePatterns
    // 4. Extract CTAs from ad copy → ctaPatterns
    // 5. Map countries from ad targeting → geoHotspots

    throw new Error('meta_ad_library: not_yet_implemented')
  }
}

// ──────────────────────────────── App Store Intel (Free)

/**
 * App Store intelligence — scrapes Google Play and Apple App Store
 * for app metadata, ratings, and download estimates.
 *
 * Uses: google-play-scraper (npm), iTunes Lookup API
 * Cost: Free
 */
export class AppStoreIntelProvider implements MarketIntelProvider {
  readonly name = 'app-store-intel'

  static isConfigured(): boolean {
    // Always available — no API key needed
    return true
  }

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    // TODO: Implement when ready
    // 1. Search Google Play for iGaming apps in this vertical
    // 2. Scrape ratings, download counts, recent reviews
    // 3. Cross-reference with iTunes Lookup for iOS presence
    // 4. Build topAdvertisers from publisher → app mapping
    // 5. Analyze app descriptions for trending features

    throw new Error('app_store_intel: not_yet_implemented')
  }
}

// ──────────────────────────────── Tranco Ranking (Free)

/**
 * Tranco list — daily-updated domain ranking combining Alexa, Umbrella,
 * Majestic, and Quantcast.  Gives us a rough traffic proxy.
 *
 * Data: https://tranco-list.eu/ (free, CC BY 4.0)
 * Format: CSV, ~1M domains ranked
 */
export class TrancoRankingProvider implements MarketIntelProvider {
  readonly name = 'tranco-ranking'

  static isConfigured(): boolean {
    // Could check for a local cache of the Tranco list
    return false // Not yet implemented
  }

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    // TODO: Implement when ready
    // 1. Download or read cached Tranco list
    // 2. Look up known iGaming domains for this vertical
    // 3. Rank position → traffic estimate → shareOfVoice proxy
    // 4. Combine with WHOIS/DNS data for geo inference

    throw new Error('tranco_ranking: not_yet_implemented')
  }
}

// ──────────────────────────────── SimilarWeb (Paid)

/**
 * SimilarWeb API — premium traffic intelligence.
 *
 * API: https://api.similarweb.com/
 * Cost: $$$ (enterprise plans start ~$500/mo)
 *
 * What it adds:
 *   - Monthly unique visitors per domain
 *   - Traffic sources breakdown (direct, search, social, referral, display)
 *   - Audience demographics (age, gender, interests)
 *   - Geographic traffic split
 *   - Top referring domains and outgoing links
 */
export class SimilarWebProvider implements MarketIntelProvider {
  readonly name = 'similarweb'

  static isConfigured(): boolean {
    return !!process.env.SIMILARWEB_API_KEY
  }

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    if (!SimilarWebProvider.isConfigured()) {
      throw new Error('SIMILARWEB_API_KEY not configured')
    }

    // TODO: Implement when API access is procured
    throw new Error('similarweb: not_yet_implemented')
  }
}

// ──────────────────────────────── Export all

export const LAYER3_PROVIDERS = {
  'meta-ad-library': MetaAdLibraryProvider,
  'app-store-intel': AppStoreIntelProvider,
  'tranco-ranking': TrancoRankingProvider,
  'similarweb': SimilarWebProvider,
} as const

export type Layer3ProviderName = keyof typeof LAYER3_PROVIDERS

/**
 * Returns list of Layer3 providers that are currently configured
 * and ready to use.
 */
export function getAvailableLayer3Providers(): Layer3ProviderName[] {
  return (Object.entries(LAYER3_PROVIDERS) as [Layer3ProviderName, typeof MetaAdLibraryProvider][])
    .filter(([, Provider]) => Provider.isConfigured())
    .map(([name]) => name)
}
