/**
 * Report type definitions for moboost-maas product marketing reports.
 *
 * Three report tiers:
 *   - 'lite'   → free, 3 credits, partial sections (hook for conversion)
 *   - 'full'   → paid, 10 credits, all sections with full depth
 *   - 'competitive-brief' → paid, 8 credits, competitor-focused deep-dive
 *
 * The report output is structured JSON so the frontend can render it
 * with fine-grained layout control (cards, charts, gates).  The LLM
 * generates each section independently, which gives us:
 *   1. Per-section streaming / progressive rendering
 *   2. Easy gate placement (free vs. paid sections)
 *   3. Independent retry on failure
 */

// ──────────────────────────────── Section definitions

export type ReportSectionId =
  | 'product_overview'
  | 'market_position'
  | 'competitor_landscape'
  | 'creative_analysis'
  | 'asset_evaluation'
  | 'regional_strategy'
  | 'audience_insights'
  | 'channel_strategy'
  | 'content_recommendations'
  | 'action_plan'

export type ReportSection = {
  id: ReportSectionId
  title: string
  /** Markdown content — the LLM output for this section. */
  content: string
  /** Whether this section is gated (paid-only). */
  gated: boolean
  /** Structured data the frontend can render as cards/charts. */
  data?: Record<string, unknown>
}

// ──────────────────────────────── Report kinds

export type ReportKind = 'lite' | 'full' | 'competitive-brief'

/** Which sections are included in each report kind. */
export const REPORT_SECTIONS: Record<ReportKind, ReportSectionId[]> = {
  lite: [
    'product_overview',
    'market_position',
    'competitor_landscape',  // teaser only
    'asset_evaluation',      // teaser only
    'regional_strategy',     // teaser only
  ],
  full: [
    'product_overview',
    'market_position',
    'competitor_landscape',
    'creative_analysis',
    'asset_evaluation',
    'regional_strategy',
    'audience_insights',
    'channel_strategy',
    'content_recommendations',
    'action_plan',
  ],
  'competitive-brief': [
    'product_overview',
    'competitor_landscape',
    'creative_analysis',
    'channel_strategy',
  ],
}

/**
 * In 'lite' reports, sections beyond the first 2 are gated (teaser only).
 * Full reports show everything.
 */
export const LITE_FREE_SECTIONS = 2

// ──────────────────────────────── Section metadata (for titles & prompts)

export const SECTION_META: Record<ReportSectionId, { title: string; promptHint: string }> = {
  product_overview: {
    title: 'Product Overview',
    promptHint:
      'Summarize the product: what it is, who it targets, core value propositions, key features, and tone of voice. Be specific to THIS product, not generic industry boilerplate.',
  },
  market_position: {
    title: 'Market Position & Opportunity',
    promptHint:
      'Analyze the product\'s market positioning within its iGaming vertical(s). Identify the positioning gap vs. top advertisers. Highlight underserved geos and audience segments. Use the market intel data provided.',
  },
  competitor_landscape: {
    title: 'Competitor Landscape',
    promptHint:
      'Map top competitors by share of voice, creative strategy, and geographic focus. Identify what competitors do well and where THIS product can differentiate. Use the topAdvertisers and creativePatterns data.',
  },
  creative_analysis: {
    title: 'Creative Analysis & Trends',
    promptHint:
      'Analyze the dominant creative patterns, hooks, and CTAs in this vertical. Identify which formats (video/static/carousel) perform best. Recommend specific creative angles this product should adopt or avoid.',
  },
  asset_evaluation: {
    title: 'Asset & Landing Page Evaluation',
    promptHint:
      `Evaluate the product's current marketing assets (creatives, ad images, videos) and landing page(s) based on the product URL and enrichment data. Score each dimension:
- **Creative Quality**: visual appeal, brand consistency, message clarity (1-10)
- **Landing Page Effectiveness**: load speed perception, CTA clarity, trust signals, mobile-readiness (1-10)
- **Message-Market Fit**: how well current messaging matches the target audience and vertical trends (1-10)
- **Competitive Gap**: how the product's assets compare to top competitors' creative patterns (1-10)

For each dimension, provide: current score, what's working, what's broken, and a specific fix using Moboost tools (AI creative generation or landing page builder). Be brutally honest.`,
  },
  regional_strategy: {
    title: 'Regional Strategy & Creative Recommendations',
    promptHint:
      `Based on geo hotspots, competitor distribution, and product characteristics, recommend the TOP 3 target regions/countries for this product. For each region:
- **Region**: country/area name and why it's a fit
- **Audience Profile**: who to target in this region (age, interests, behavior)
- **Creative Type**: what format works best here (short video, static banner, carousel, UGC-style, etc.)
- **Messaging Angle**: the key selling point that resonates with this region's audience
- **Language/Localization**: language and cultural considerations

Output as structured recommendations. Be specific — use real geo data from market intel when available.`,
  },
  audience_insights: {
    title: 'Audience Insights',
    promptHint:
      'Profile the target audience segments for this product based on geo hotspots, vertical trends, and product features. Include demographic, psychographic, and behavioral signals.',
  },
  channel_strategy: {
    title: 'Channel Strategy',
    promptHint:
      'Recommend the top 3-5 marketing channels for this product based on competitor channel mix and product characteristics. Include platform-specific tactics (Meta, Google, TikTok, programmatic, affiliate).',
  },
  content_recommendations: {
    title: 'Content & Creative Recommendations',
    promptHint:
      'Provide 5-8 specific creative briefs or concepts this product should produce. Each should include: format, hook, key message, CTA, target spec (dimensions/duration). Make them actionable and specific.',
  },
  action_plan: {
    title: '30-Day Action Plan',
    promptHint:
      'Create a prioritized 30-day marketing launch plan with specific weekly milestones. Include: creative production schedule, channel activation order, budget allocation suggestion, and KPI targets.',
  },
}

// ──────────────────────────────── Full report output shape

export type ReportOutput = {
  kind: ReportKind
  productId: string
  productName: string
  productUrl: string
  vertical: string | null
  sections: ReportSection[]
  /** Auto-generated brief with audience groups — null for lite (until unlocked) */
  brief: ReportBrief | null
  generatedAt: string
  model: string
  /** Source of market intel used. */
  marketIntelSource: string | null
  /** Warnings/degradation notes. */
  warnings: string[]
}

// ──────────────────────────────── Brief (auto-generated from report)

/** A single audience group within a brief */
export type AudienceGroup = {
  id: string
  /** Audience tag / label, e.g. "25-34 Male Sports Enthusiasts in Brazil" */
  audienceTag: string
  /** Demographic + psychographic description */
  audienceProfile: string
  /** Region/geo this group targets */
  region: string
  /** The selling point tailored to THIS audience (scenario-matched) */
  sellingPoint: string
  /** Creative direction: format, style, tone */
  creativeDirection: string
  /** Landing page brief: what elements to include, style matching creative */
  landingPageBrief: string
}

/** Brief auto-generated from report findings, user can edit then execute */
export type ReportBrief = {
  /** Product context */
  productId: string
  productName: string
  /** The 3 audience groups (demo stage = 3 groups) */
  audienceGroups: AudienceGroup[]
  /** Overall campaign theme */
  campaignTheme: string
  /** Shared brand elements across all groups */
  sharedBrandElements: {
    logo?: string
    colorPalette: string[]
    tone: string
  }
}

// ──────────────────────────────── API request/response

export type GenerateReportRequest = {
  productId: string
  kind?: ReportKind
}

export type GenerateReportResponse = {
  ok: true
  reportId: string
  report: ReportOutput
} | {
  ok: false
  error: string
}
