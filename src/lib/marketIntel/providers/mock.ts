/**
 * Mock MarketIntelProvider — deterministic fixtures.
 *
 * Purpose: unblock downstream generation (marketing recommendations)
 * before the Insightrackr contract lands.  Everything here is PLAUSIBLE
 * but FAKE — don't mix it into any user-facing claim without the
 * `mock` source tag.
 *
 * The data is hand-picked to reflect what general Martech verticals
 * actually look like in the wild (top brands, common creative hooks,
 * typical CTA patterns), not random nonsense — this makes end-to-end
 * testing of the recommendation pipeline meaningful.
 */
import type {
  CreativePattern,
  GeoHotspot,
  MarketIntelProvider,
  TopAdvertiser,
  Vertical,
  VerticalIntel,
} from '../types'

type Fixture = {
  topAdvertisers: TopAdvertiser[]
  creativePatterns: CreativePattern[]
  trendingFeatures: string[]
  ctaPatterns: string[]
  geoHotspots: GeoHotspot[]
}

const FIXTURES: Record<Vertical, Fixture> = {
  'E-commerce': {
    topAdvertisers: [
      {
        name: 'Shopify',
        topChannels: ['Meta', 'Google Search', 'YouTube'],
        shareOfVoice: 26,
        topGeos: ['US', 'GB', 'CA', 'AU'],
      },
      {
        name: 'Amazon',
        topChannels: ['Google Search', 'Meta', 'TikTok'],
        shareOfVoice: 22,
        topGeos: ['US', 'DE', 'JP', 'GB'],
      },
      {
        name: 'Shein',
        topChannels: ['TikTok', 'Meta', 'Instagram'],
        shareOfVoice: 15,
        topGeos: ['US', 'BR', 'MX', 'FR'],
      },
      {
        name: 'Temu',
        topChannels: ['Meta', 'Google Display', 'TikTok'],
        shareOfVoice: 12,
        topGeos: ['US', 'GB', 'DE', 'AU'],
      },
    ],
    creativePatterns: [
      {
        label: 'Flash sale countdown',
        format: 'video',
        frequency: 35,
        hookPattern:
          'Opens with ticking clock animation, product grid with slashed prices, urgent voiceover "Only 3 hours left", ends on shop-now button',
        ctas: ['Shop Now', 'Grab the Deal'],
      },
      {
        label: 'Unboxing UGC',
        format: 'video',
        frequency: 28,
        hookPattern:
          'Creator opens package on camera, genuine reaction shot, product close-up with overlay showing price and rating, swipe-up CTA',
        ctas: ['Order Yours', 'See Reviews'],
      },
      {
        label: 'Free shipping threshold banner',
        format: 'static',
        frequency: 19,
        hookPattern:
          'Bold "Free Shipping on Orders $50+" headline, curated product collage, progress bar showing cart value, brand logo corner',
        ctas: ['Shop Now', 'Complete Your Cart'],
      },
    ],
    trendingFeatures: [
      'AI-powered product recommendations',
      'Buy now, pay later integration',
      'Shoppable livestreams',
      'Same-day delivery guarantees',
      'AR try-on for fashion and beauty',
    ],
    ctaPatterns: ['Shop Now', 'Add to Cart', 'Get Free Shipping', 'See Today\'s Deals'],
    geoHotspots: [
      { country: 'US', reason: 'Largest e-commerce market globally', weight: 95 },
      { country: 'BR', reason: 'Fastest-growing LATAM e-commerce market', weight: 78 },
      { country: 'IN', reason: 'Rapid digital commerce adoption', weight: 72 },
    ],
  },
  SaaS: {
    topAdvertisers: [
      {
        name: 'HubSpot',
        topChannels: ['Google Search', 'LinkedIn', 'YouTube'],
        shareOfVoice: 21,
        topGeos: ['US', 'GB', 'DE', 'AU'],
      },
      {
        name: 'Salesforce',
        topChannels: ['LinkedIn', 'Google Search', 'Meta'],
        shareOfVoice: 19,
        topGeos: ['US', 'GB', 'JP'],
      },
      {
        name: 'Notion',
        topChannels: ['YouTube', 'TikTok', 'Meta'],
        shareOfVoice: 14,
        topGeos: ['US', 'KR', 'JP', 'DE'],
      },
    ],
    creativePatterns: [
      {
        label: 'Before/after workflow demo',
        format: 'video',
        frequency: 38,
        hookPattern:
          'Split screen showing cluttered spreadsheet vs clean dashboard, timer shows "5 min setup", ends on free trial CTA',
        ctas: ['Start Free Trial', 'See It in Action'],
      },
      {
        label: 'ROI calculator teaser',
        format: 'static',
        frequency: 24,
        hookPattern:
          '"Save 10+ hours per week" headline with calculator graphic, customer logos for social proof, CTA button below',
        ctas: ['Calculate Your ROI', 'Try Free'],
      },
    ],
    trendingFeatures: [
      'AI copilot built into workflows',
      'No-code automation builder',
      'Native integrations marketplace',
      'Usage-based pricing tiers',
    ],
    ctaPatterns: ['Start Free Trial', 'Book a Demo', 'Try Free', 'See Pricing'],
    geoHotspots: [
      { country: 'US', reason: 'Dominant SaaS market with highest spend', weight: 92 },
      { country: 'DE', reason: 'Largest European B2B SaaS market', weight: 65 },
    ],
  },
  'Mobile Apps': {
    topAdvertisers: [
      {
        name: 'Canva',
        topChannels: ['Meta', 'TikTok', 'YouTube'],
        shareOfVoice: 18,
        topGeos: ['US', 'AU', 'BR', 'IN'],
      },
      {
        name: 'Duolingo',
        topChannels: ['TikTok', 'Meta', 'YouTube'],
        shareOfVoice: 16,
        topGeos: ['US', 'BR', 'MX', 'JP'],
      },
      {
        name: 'Calm',
        topChannels: ['Meta', 'YouTube', 'Podcast'],
        shareOfVoice: 11,
        topGeos: ['US', 'GB', 'CA'],
      },
    ],
    creativePatterns: [
      {
        label: 'App screen recording walkthrough',
        format: 'video',
        frequency: 42,
        hookPattern:
          'Phone mockup with finger tapping through app flow, quick cuts showing key features, "Download free" end card',
        ctas: ['Download Free', 'Install Now'],
      },
      {
        label: 'Social proof carousel',
        format: 'static',
        frequency: 22,
        hookPattern:
          'App Store 4.8-star rating badge, "10M+ downloads" headline, 3 user review quotes, gradient background',
        ctas: ['Get the App', 'Try It Free'],
      },
    ],
    trendingFeatures: [
      'Personalized onboarding flows',
      'Push notification drip campaigns',
      'In-app referral rewards',
      'Subscription trial with paywall optimization',
    ],
    ctaPatterns: ['Download Free', 'Install Now', 'Get the App', 'Start Your Trial'],
    geoHotspots: [
      { country: 'US', reason: 'Highest mobile app revenue market', weight: 90 },
      { country: 'IN', reason: 'Fastest-growing mobile-first user base', weight: 85 },
    ],
  },
  Gaming: {
    topAdvertisers: [
      {
        name: 'Supercell',
        topChannels: ['YouTube', 'TikTok', 'Meta'],
        shareOfVoice: 20,
        topGeos: ['US', 'JP', 'KR', 'DE'],
      },
      {
        name: 'miHoYo',
        topChannels: ['YouTube', 'Twitter/X', 'TikTok'],
        shareOfVoice: 17,
        topGeos: ['CN', 'JP', 'US', 'KR'],
      },
      {
        name: 'King',
        topChannels: ['Meta', 'Google Display', 'TikTok'],
        shareOfVoice: 14,
        topGeos: ['US', 'GB', 'DE'],
      },
    ],
    creativePatterns: [
      {
        label: 'Gameplay highlight reel',
        format: 'video',
        frequency: 44,
        hookPattern:
          'Fast-cut gameplay footage, boss fight or big win moment, explosion of effects, "Play Free" end card with app icon',
        ctas: ['Play Free', 'Download Now'],
      },
      {
        label: 'New character/update reveal',
        format: 'video',
        frequency: 26,
        hookPattern:
          'Cinematic character intro, special ability showcase, limited-time event banner, countdown timer',
        ctas: ['Play Now', 'Join the Event'],
      },
    ],
    trendingFeatures: [
      'Season pass and battle pass systems',
      'Cross-platform progression',
      'Community events with real-world rewards',
      'AI-generated content and NPCs',
    ],
    ctaPatterns: ['Play Free', 'Download Now', 'Join the Battle', 'Play Now'],
    geoHotspots: [
      { country: 'US', reason: 'Largest mobile gaming revenue market', weight: 88 },
      { country: 'JP', reason: 'High ARPU gacha market', weight: 84 },
      { country: 'KR', reason: 'Competitive gaming culture drives installs', weight: 72 },
    ],
  },
  Fintech: {
    topAdvertisers: [
      {
        name: 'Revolut',
        topChannels: ['Meta', 'Google Search', 'YouTube'],
        shareOfVoice: 22,
        topGeos: ['GB', 'DE', 'FR', 'PL'],
      },
      {
        name: 'Cash App',
        topChannels: ['TikTok', 'Meta', 'Twitter/X'],
        shareOfVoice: 18,
        topGeos: ['US', 'GB'],
      },
      {
        name: 'Wise',
        topChannels: ['Google Search', 'YouTube', 'Meta'],
        shareOfVoice: 12,
        topGeos: ['GB', 'US', 'AU', 'SG'],
      },
    ],
    creativePatterns: [
      {
        label: 'Fee comparison breakdown',
        format: 'static',
        frequency: 36,
        hookPattern:
          'Side-by-side comparison: bank fee vs app fee, large savings number highlighted, trust badges, "Switch now" CTA',
        ctas: ['Switch Now', 'Save More'],
      },
      {
        label: 'Instant transfer demo',
        format: 'video',
        frequency: 30,
        hookPattern:
          'Phone screen showing money sent in 3 taps, confetti animation on success, recipient notification preview, speed metric overlay',
        ctas: ['Send Money Free', 'Get Started'],
      },
    ],
    trendingFeatures: [
      'Instant cross-border transfers',
      'Multi-currency accounts',
      'Budgeting and savings vaults',
      'Crypto trading integration',
    ],
    ctaPatterns: ['Get Started', 'Open Free Account', 'Switch Now', 'Send Money Free'],
    geoHotspots: [
      { country: 'GB', reason: 'Open banking regulation drives fintech adoption', weight: 85 },
      { country: 'BR', reason: 'PIX and fintech-friendly regulation', weight: 78 },
    ],
  },
  'Health & Wellness': {
    topAdvertisers: [
      {
        name: 'Peloton',
        topChannels: ['Meta', 'YouTube', 'Google Search'],
        shareOfVoice: 19,
        topGeos: ['US', 'GB', 'CA', 'DE'],
      },
      {
        name: 'Noom',
        topChannels: ['Meta', 'Google Search', 'YouTube'],
        shareOfVoice: 15,
        topGeos: ['US', 'GB', 'AU'],
      },
    ],
    creativePatterns: [
      {
        label: 'Transformation story testimonial',
        format: 'video',
        frequency: 39,
        hookPattern:
          'Real user telling their journey, before/after photos, emotional music, coach interaction clip, "Start today" end card',
        ctas: ['Start Your Journey', 'Take the Quiz'],
      },
    ],
    trendingFeatures: [
      'AI-personalized meal and workout plans',
      'Wearable device integration',
      'Community challenges and leaderboards',
      'Telehealth consultations',
    ],
    ctaPatterns: ['Start Your Journey', 'Take the Quiz', 'Try Free for 7 Days', 'Join Now'],
    geoHotspots: [
      { country: 'US', reason: 'Largest health and wellness app market', weight: 88 },
    ],
  },
  EdTech: {
    topAdvertisers: [
      {
        name: 'Coursera',
        topChannels: ['Google Search', 'YouTube', 'LinkedIn'],
        shareOfVoice: 23,
        topGeos: ['US', 'IN', 'BR', 'GB'],
      },
      {
        name: 'MasterClass',
        topChannels: ['YouTube', 'Meta', 'Podcast'],
        shareOfVoice: 16,
        topGeos: ['US', 'GB', 'CA'],
      },
    ],
    creativePatterns: [
      {
        label: 'Instructor spotlight clip',
        format: 'video',
        frequency: 34,
        hookPattern:
          'Famous instructor speaking to camera, quick cuts of course content, student success metrics overlay, enrollment CTA',
        ctas: ['Enroll Free', 'Start Learning'],
      },
    ],
    trendingFeatures: [
      'AI-powered adaptive learning paths',
      'Micro-credentials and digital badges',
      'Cohort-based live courses',
      'Enterprise team licensing',
    ],
    ctaPatterns: ['Enroll Free', 'Start Learning', 'Explore Courses', 'Get Certified'],
    geoHotspots: [
      { country: 'IN', reason: 'Massive demand for online upskilling', weight: 90 },
      { country: 'US', reason: 'Corporate learning budget expansion', weight: 82 },
    ],
  },
  'Food & Delivery': {
    topAdvertisers: [
      {
        name: 'DoorDash',
        topChannels: ['Meta', 'TikTok', 'Google Search'],
        shareOfVoice: 24,
        topGeos: ['US', 'CA', 'AU', 'JP'],
      },
      {
        name: 'Uber Eats',
        topChannels: ['Meta', 'YouTube', 'TikTok'],
        shareOfVoice: 20,
        topGeos: ['US', 'GB', 'MX', 'JP'],
      },
    ],
    creativePatterns: [
      {
        label: 'Craving trigger close-up',
        format: 'video',
        frequency: 45,
        hookPattern:
          'Extreme close-up of food being prepared, steam and sizzle sounds, delivery countdown overlay, "Order now" CTA card',
        ctas: ['Order Now', 'Get $10 Off'],
      },
    ],
    trendingFeatures: [
      'Subscription-based free delivery',
      'Real-time driver tracking',
      'Group ordering and split payments',
      'AI-curated restaurant recommendations',
    ],
    ctaPatterns: ['Order Now', 'Get $10 Off', 'Free Delivery Today', 'Try DashPass Free'],
    geoHotspots: [
      { country: 'US', reason: 'Largest food delivery market by revenue', weight: 92 },
    ],
  },
  'Travel & Hospitality': {
    topAdvertisers: [
      {
        name: 'Booking.com',
        topChannels: ['Google Search', 'Meta', 'YouTube'],
        shareOfVoice: 28,
        topGeos: ['US', 'GB', 'DE', 'FR'],
      },
      {
        name: 'Airbnb',
        topChannels: ['Meta', 'YouTube', 'TikTok'],
        shareOfVoice: 21,
        topGeos: ['US', 'FR', 'IT', 'ES'],
      },
    ],
    creativePatterns: [
      {
        label: 'Dream destination reveal',
        format: 'video',
        frequency: 37,
        hookPattern:
          'Drone footage of stunning destination, price overlay animation, calendar showing availability, "Book now" button pulse',
        ctas: ['Book Now', 'Explore Deals'],
      },
    ],
    trendingFeatures: [
      'Flexible cancellation policies',
      'AI trip planning assistants',
      'Price match guarantees',
      'Loyalty points and tier rewards',
    ],
    ctaPatterns: ['Book Now', 'Explore Deals', 'Find Your Stay', 'Check Availability'],
    geoHotspots: [
      { country: 'US', reason: 'Largest outbound travel market', weight: 88 },
      { country: 'DE', reason: 'Highest travel spend per capita in Europe', weight: 71 },
    ],
  },
  'Media & Entertainment': {
    topAdvertisers: [
      {
        name: 'Spotify',
        topChannels: ['Meta', 'TikTok', 'YouTube'],
        shareOfVoice: 25,
        topGeos: ['US', 'GB', 'BR', 'DE'],
      },
      {
        name: 'Netflix',
        topChannels: ['YouTube', 'Meta', 'Twitter/X'],
        shareOfVoice: 20,
        topGeos: ['US', 'GB', 'BR', 'IN'],
      },
    ],
    creativePatterns: [
      {
        label: 'Exclusive content teaser',
        format: 'video',
        frequency: 41,
        hookPattern:
          'Quick-cut montage of original content, dramatic music, "Only on [Platform]" branding, release date countdown',
        ctas: ['Watch Now', 'Start Free Trial'],
      },
    ],
    trendingFeatures: [
      'Ad-supported free tiers',
      'Personalized content recommendations',
      'Offline download capabilities',
      'Social sharing and watch parties',
    ],
    ctaPatterns: ['Watch Now', 'Start Free Trial', 'Subscribe', 'Explore Content'],
    geoHotspots: [
      { country: 'US', reason: 'Streaming wars drive aggressive UA spend', weight: 90 },
      { country: 'IN', reason: 'Fastest-growing streaming subscriber base', weight: 82 },
    ],
  },
}

export class MockMarketIntelProvider implements MarketIntelProvider {
  readonly name = 'mock'

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    const f = FIXTURES[vertical]
    return {
      vertical,
      source: this.name,
      generatedAt: new Date().toISOString(),
      topAdvertisers: f.topAdvertisers,
      creativePatterns: f.creativePatterns,
      trendingFeatures: f.trendingFeatures,
      ctaPatterns: f.ctaPatterns,
      geoHotspots: f.geoHotspots,
      coverageNote:
        'deterministic fixture — do not quote as ground truth in user-facing output',
    }
  }
}
