/**
 * Landing page templates — 3 pre-built layouts for the demo phase.
 *
 * Each template defines:
 *   - Structure: section order and types
 *   - Slots: where AI-generated content goes
 *   - Styling: color scheme and layout variant
 *
 * The AI fills slots based on product enrichment + report data.
 * Users can preview and download the generated HTML.
 */

export type TemplateId = 'hero-cta' | 'feature-grid' | 'social-proof'

export type TemplateSlot = {
  id: string
  label: string
  type: 'headline' | 'subheadline' | 'body' | 'cta' | 'features' | 'testimonials' | 'image-prompt'
  /** Prompt hint for the AI to fill this slot. */
  hint: string
}

export type TemplateSectionDef = {
  id: string
  type: 'hero' | 'features' | 'social-proof' | 'cta-banner' | 'footer'
  slots: TemplateSlot[]
}

export type LandingTemplate = {
  id: TemplateId
  name: string
  description: string
  preview: string // emoji or thumbnail
  sections: TemplateSectionDef[]
  colorScheme: {
    primary: string
    secondary: string
    background: string
    text: string
  }
}

// ──────────────────────────────── Template definitions

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: 'hero-cta',
    name: 'Hero + CTA',
    description: 'Bold hero section with a single strong CTA. Best for app downloads and sign-ups.',
    preview: '🚀',
    colorScheme: {
      primary: '#10b981',
      secondary: '#059669',
      background: '#0f172a',
      text: '#f8fafc',
    },
    sections: [
      {
        id: 'hero',
        type: 'hero',
        slots: [
          { id: 'headline', label: 'Headline', type: 'headline', hint: 'A compelling 5-8 word headline that grabs attention. Include the product name and key benefit.' },
          { id: 'subheadline', label: 'Subheadline', type: 'subheadline', hint: 'A 15-25 word supporting line that explains the value proposition.' },
          { id: 'hero_cta', label: 'CTA Button', type: 'cta', hint: 'A 2-4 word action phrase (e.g., "Start Betting Now", "Get Your Bonus").' },
          { id: 'hero_image', label: 'Hero Image', type: 'image-prompt', hint: 'Describe an image that represents the product. Modern, vibrant, iGaming themed.' },
        ],
      },
      {
        id: 'features',
        type: 'features',
        slots: [
          { id: 'features_list', label: 'Key Features', type: 'features', hint: 'List 3-4 key features with icon suggestions and short descriptions (max 15 words each).' },
        ],
      },
      {
        id: 'cta_bottom',
        type: 'cta-banner',
        slots: [
          { id: 'bottom_headline', label: 'Bottom CTA', type: 'headline', hint: 'A urgency-driven headline to close (e.g., "Don\'t Miss Out").' },
          { id: 'bottom_cta', label: 'CTA Button', type: 'cta', hint: 'Final CTA text, slightly different from hero CTA.' },
        ],
      },
      {
        id: 'footer',
        type: 'footer',
        slots: [],
      },
    ],
  },
  {
    id: 'feature-grid',
    name: 'Feature Grid',
    description: 'Feature-focused layout with a grid of benefits. Best for showcasing product capabilities.',
    preview: '📊',
    colorScheme: {
      primary: '#6366f1',
      secondary: '#4f46e5',
      background: '#ffffff',
      text: '#1e293b',
    },
    sections: [
      {
        id: 'hero',
        type: 'hero',
        slots: [
          { id: 'headline', label: 'Headline', type: 'headline', hint: 'Product-focused headline highlighting what makes it unique.' },
          { id: 'subheadline', label: 'Subheadline', type: 'subheadline', hint: 'Explain the core value in one sentence.' },
        ],
      },
      {
        id: 'features',
        type: 'features',
        slots: [
          { id: 'features_list', label: 'Features Grid', type: 'features', hint: 'List 6 features in a 2x3 grid format. Each: icon emoji + title (3 words) + description (15 words max).' },
        ],
      },
      {
        id: 'social',
        type: 'social-proof',
        slots: [
          { id: 'testimonials', label: 'Social Proof', type: 'testimonials', hint: 'Generate 3 realistic user testimonials with names, roles, and quotes about using this product.' },
        ],
      },
      {
        id: 'cta_bottom',
        type: 'cta-banner',
        slots: [
          { id: 'bottom_headline', label: 'Bottom CTA', type: 'headline', hint: 'Summary headline reinforcing the value.' },
          { id: 'bottom_cta', label: 'CTA Button', type: 'cta', hint: 'Primary action CTA.' },
        ],
      },
      { id: 'footer', type: 'footer', slots: [] },
    ],
  },
  {
    id: 'social-proof',
    name: 'Social Proof',
    description: 'Trust-driven layout with testimonials and stats. Best for conversion optimization.',
    preview: '⭐',
    colorScheme: {
      primary: '#f59e0b',
      secondary: '#d97706',
      background: '#1a1a2e',
      text: '#e2e8f0',
    },
    sections: [
      {
        id: 'hero',
        type: 'hero',
        slots: [
          { id: 'headline', label: 'Headline', type: 'headline', hint: 'Trust-building headline with a specific metric or achievement.' },
          { id: 'subheadline', label: 'Subheadline', type: 'subheadline', hint: 'Supporting credibility statement.' },
          { id: 'hero_cta', label: 'CTA Button', type: 'cta', hint: 'Low-friction CTA (e.g., "Try Free", "See Demo").' },
        ],
      },
      {
        id: 'social',
        type: 'social-proof',
        slots: [
          { id: 'testimonials', label: 'Testimonials', type: 'testimonials', hint: 'Generate 3 testimonials from different user personas (casual bettor, pro, new user). Include star ratings.' },
        ],
      },
      {
        id: 'features',
        type: 'features',
        slots: [
          { id: 'features_list', label: 'Trust Features', type: 'features', hint: 'List 4 trust signals (licensed, secure payments, fast withdrawals, 24/7 support) with short descriptions.' },
        ],
      },
      {
        id: 'cta_bottom',
        type: 'cta-banner',
        slots: [
          { id: 'bottom_headline', label: 'Final Push', type: 'headline', hint: 'FOMO or scarcity headline.' },
          { id: 'bottom_cta', label: 'CTA Button', type: 'cta', hint: 'Urgency CTA.' },
        ],
      },
      { id: 'footer', type: 'footer', slots: [] },
    ],
  },
]

export function getTemplate(id: TemplateId): LandingTemplate | undefined {
  return LANDING_TEMPLATES.find((t) => t.id === id)
}

// ──────────────────────────────── Filled content type

export type FilledSlot = {
  slotId: string
  content: string
}

export type GeneratedLanding = {
  templateId: TemplateId
  productName: string
  filledSlots: FilledSlot[]
  html: string
  generatedAt: string
  model: string
}
