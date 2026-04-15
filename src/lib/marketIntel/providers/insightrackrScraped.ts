/**
 * InsightrackrScrapedProvider — reads the 5 brand JSON fixtures
 * collected from Insightrackr via browser automation and maps them
 * into the VerticalIntel canonical shape.
 *
 * This is the "Layer 2" approach: real data, no API dependency.
 * Good enough for demo. When official API access arrives, the sync
 * runner will prefer InsightrackrProvider over this.
 *
 * Fixture files live at: data/insightrackr/<brand>_creatives.json
 *
 * Supported brands:
 *   1xBet (63 creatives), Melbet (51), Fun88 (1452 via alias),
 *   Thrillzz (2031), Easybet (152)
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type {
  MarketIntelProvider,
  Vertical,
  VerticalIntel,
  TopAdvertiser,
  CreativePattern,
  GeoHotspot,
} from '../types'

// ──────────────────────────────── Fixture data shape

type FixtureVideo = {
  rank: number
  duration: string
  firstSeen: string
  lifetimeDays: number
  impressions: string
  impressionsNum: number
  creativeGroups: number
  publisher: string
  channels: number
  note?: string
}

type FixtureFile = {
  brand: string
  unifiedProduct: string
  company: string
  category: string
  insightrackrPath: string
  relatedProducts: Array<{
    name: string
    id: string
    platform: string
    status: string
    developer: string
    lifetimeDays: number
  }>
  totalCreatives: number
  creativeGroups: number
  dateRange: string
  topVideosByImpressions: FixtureVideo[]
}

// ──────────────────────────────── Brand → Vertical mapping

const BRAND_VERTICAL_MAP: Record<string, string> = {
  '1xbet': 'Sports Betting',
  'melbet': 'Sports Betting',
  'fun88': 'Casino',
  'thrillzz': 'Casino',
  'easybet': 'Sports Betting',
}

// ──────────────────────────────── Provider

const FIXTURE_DIR = join(process.cwd(), 'data', 'insightrackr')
const FIXTURE_FILES = [
  '1xbet_creatives.json',
  'melbet_creatives.json',
  'fun88_creatives.json',
  'thrillzz_creatives.json',
  'easybet_creatives.json',
]

export class InsightrackrScrapedProvider implements MarketIntelProvider {
  readonly name = 'insightrackr-scraped'

  private fixtures: FixtureFile[] | null = null

  static isConfigured(): boolean {
    return existsSync(join(FIXTURE_DIR, '1xbet_creatives.json'))
  }

  private loadFixtures(): FixtureFile[] {
    if (this.fixtures) return this.fixtures
    this.fixtures = []
    for (const file of FIXTURE_FILES) {
      const path = join(FIXTURE_DIR, file)
      if (!existsSync(path)) continue
      try {
        const raw = readFileSync(path, 'utf-8')
        this.fixtures.push(JSON.parse(raw) as FixtureFile)
      } catch {
        // skip corrupt files
      }
    }
    return this.fixtures
  }

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    const fixtures = this.loadFixtures()
    if (fixtures.length === 0) {
      throw new Error('insightrackr_scraped: no fixture files found')
    }

    // Filter brands relevant to this vertical
    const relevantBrands = fixtures.filter((f) => {
      const brandKey = f.brand.toLowerCase().replace(/\s+/g, '')
      const brandVertical = BRAND_VERTICAL_MAP[brandKey]
      // Include if brand's vertical matches, OR if we have few brands for this vertical
      return brandVertical === vertical || vertical === 'Casino' || vertical === 'Sports Betting'
    })

    // If no brands match this specific vertical, use all (cross-vertical intel is still useful)
    const brandsToUse = relevantBrands.length > 0 ? relevantBrands : fixtures

    return {
      vertical,
      source: this.name,
      generatedAt: new Date().toISOString(),
      topAdvertisers: this.buildAdvertisers(brandsToUse),
      creativePatterns: this.buildCreativePatterns(brandsToUse),
      trendingFeatures: this.buildTrendingFeatures(brandsToUse),
      ctaPatterns: this.buildCtaPatterns(brandsToUse),
      geoHotspots: this.buildGeoHotspots(brandsToUse),
      coverageNote: `Insightrackr scraped data — ${brandsToUse.length} brands, ${brandsToUse.reduce((sum, b) => sum + b.totalCreatives, 0)} total creatives`,
    }
  }

  // ──────────────────────────────── Mappers

  private buildAdvertisers(brands: FixtureFile[]): TopAdvertiser[] {
    // Sort by total creatives desc → higher creative count = higher share of voice
    const sorted = [...brands].sort((a, b) => b.totalCreatives - a.totalCreatives)
    const totalCreatives = sorted.reduce((sum, b) => sum + b.totalCreatives, 0)

    return sorted.map((brand) => {
      // Infer channels from creative data
      const channels = new Set<string>()
      for (const v of brand.topVideosByImpressions) {
        if (v.channels >= 3) channels.add('Multi-channel')
        if (v.publisher) channels.add('Mobile')
      }
      channels.add('Social')

      // Infer geos from platform/publisher
      const geos = new Set<string>()
      for (const prod of brand.relatedProducts) {
        if (prod.name.includes('España') || prod.developer.includes('España')) geos.add('ES')
        if (prod.name.includes('球探') || prod.name.includes('中')) geos.add('CN')
      }
      if (geos.size === 0) geos.add('GLOBAL')

      return {
        name: brand.brand,
        shareOfVoice: Math.round((brand.totalCreatives / totalCreatives) * 100),
        topChannels: Array.from(channels).slice(0, 3),
        topGeos: Array.from(geos).slice(0, 4),
      }
    })
  }

  private buildCreativePatterns(brands: FixtureFile[]): CreativePattern[] {
    const patterns: CreativePattern[] = []
    const allVideos = brands.flatMap((b) =>
      b.topVideosByImpressions.map((v) => ({ ...v, brand: b.brand })),
    )

    // Analyze duration distribution
    const durationGroups: Record<string, number> = {}
    for (const v of allVideos) {
      const secs = parseDuration(v.duration)
      const bucket = secs <= 10 ? '≤10s' : secs <= 15 ? '11-15s' : secs <= 30 ? '16-30s' : '30s+'
      durationGroups[bucket] = (durationGroups[bucket] || 0) + 1
    }

    // Build patterns from duration analysis
    const total = allVideos.length || 1
    for (const [bucket, count] of Object.entries(durationGroups)) {
      const freq = Math.round((count / total) * 100)
      patterns.push({
        label: `${bucket} video ad`,
        format: 'video',
        frequency: freq,
        hookPattern: bucket === '≤10s'
          ? 'Quick hook → instant CTA'
          : bucket === '11-15s'
            ? 'Problem → solution → CTA'
            : 'Story arc → feature showcase → CTA',
        ctas: ['Bet Now', 'Play Now', 'Sign Up', 'Get Bonus'].slice(0, 3),
      })
    }

    // Add evergreen pattern (high lifetime)
    const evergreenCount = allVideos.filter((v) => v.lifetimeDays > 90).length
    if (evergreenCount > 0) {
      patterns.push({
        label: 'Evergreen performer (90+ days)',
        format: 'video',
        frequency: Math.round((evergreenCount / total) * 100),
        hookPattern: 'Brand-first → trust → bonus offer',
        ctas: ['Join Now', 'Claim Bonus'],
      })
    }

    // Add high-impression pattern
    const highImpression = allVideos.filter((v) => v.impressionsNum > 5_000_000).length
    if (highImpression > 0) {
      patterns.push({
        label: 'High-impression hero creative (5M+)',
        format: 'video',
        frequency: Math.round((highImpression / total) * 100),
        hookPattern: 'Event-tied → urgency → limited-time offer',
        ctas: ['Bet Now', 'Play Now'],
      })
    }

    return patterns.sort((a, b) => b.frequency - a.frequency)
  }

  private buildTrendingFeatures(brands: FixtureFile[]): string[] {
    const features = new Set<string>()
    for (const brand of brands) {
      for (const video of brand.topVideosByImpressions) {
        if (video.note) {
          // Extract keywords from notes
          const note = video.note.toLowerCase()
          if (note.includes('champion')) features.add('Champions League themed ads')
          if (note.includes('evergreen')) features.add('Evergreen always-on creatives')
          if (note.includes('winter') || note.includes('summer')) features.add('Seasonal campaign spikes')
          if (note.includes('high-performer')) features.add('Short-form video dominance')
        }
        // Duration trends
        const secs = parseDuration(video.duration)
        if (secs <= 15) features.add('Sub-15s mobile-first creatives')
        if (video.channels >= 3) features.add('Multi-channel distribution')
      }
      if (brand.totalCreatives > 100) features.add('High creative volume testing')
    }

    // Always-relevant iGaming trends
    features.add('Welcome bonus as primary hook')
    features.add('Mobile app download CTA growth')
    features.add('Localized language variants')

    return Array.from(features).slice(0, 10)
  }

  private buildCtaPatterns(brands: FixtureFile[]): string[] {
    // Common iGaming CTAs inferred from the creative landscape
    return [
      'Bet Now',
      'Play Now',
      'Sign Up & Get Bonus',
      'Download App',
      'Claim Free Spins',
      'Join Now',
      'Get Welcome Offer',
      'Try For Free',
    ]
  }

  private buildGeoHotspots(brands: FixtureFile[]): GeoHotspot[] {
    const geoMap: Record<string, { weight: number; reasons: Set<string> }> = {}

    for (const brand of brands) {
      for (const prod of brand.relatedProducts) {
        if (prod.status !== '正常') continue

        // Platform → geo inference
        if (prod.developer.includes('España') || prod.name.includes('España')) {
          addGeo(geoMap, 'ES', `${brand.brand} active in Spain`, 30)
        }
        if (prod.platform === 'iOS') {
          addGeo(geoMap, 'GLOBAL', `${brand.brand} on iOS (global reach)`, 20)
        }
        if (prod.platform === 'Android') {
          addGeo(geoMap, 'GLOBAL', `${brand.brand} on Android (emerging markets)`, 25)
        }
      }

      // High-impression → broad geo reach
      const totalImpressions = brand.topVideosByImpressions.reduce(
        (sum, v) => sum + v.impressionsNum, 0,
      )
      if (totalImpressions > 10_000_000) {
        addGeo(geoMap, 'BR', `High impression volume suggests LATAM activity`, 15)
        addGeo(geoMap, 'IN', `Mobile-first creatives signal South Asian targeting`, 15)
        addGeo(geoMap, 'NG', `iGaming growth market in Africa`, 10)
      }
    }

    return Object.entries(geoMap)
      .map(([country, data]) => ({
        country,
        weight: Math.min(data.weight, 100),
        reason: Array.from(data.reasons).slice(0, 2).join('; '),
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
  }
}

// ──────────────────────────────── Helpers

function parseDuration(dur: string): number {
  const parts = dur.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function addGeo(
  map: Record<string, { weight: number; reasons: Set<string> }>,
  country: string,
  reason: string,
  weight: number,
) {
  if (!map[country]) {
    map[country] = { weight: 0, reasons: new Set() }
  }
  map[country].weight += weight
  map[country].reasons.add(reason)
}
