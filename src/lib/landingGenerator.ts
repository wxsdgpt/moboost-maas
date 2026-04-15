/**
 * Landing page generator - fills template slots with AI-generated
 * content and renders to self-contained HTML.
 *
 * Pipeline:
 *   1. Load product enrichment data
 *   2. Load report output (if available) for context
 *   3. Call LLM to fill each template slot
 *   4. Render filled template to standalone HTML
 */

import type { EnrichmentRecord } from './productEnrichment'
import { callLLM } from '@/lib/callLLM'
import {
  type TemplateId,
  type LandingTemplate,
  type FilledSlot,
  type GeneratedLanding,
  getTemplate,
} from './landingTemplates'

const LANDING_MODEL =
  process.env.LANDING_MODEL || 'anthropic/claude-sonnet-4-6'

type LandingContext = {
  productName: string
  productUrl: string
  vertical: string | null
  enrichment: EnrichmentRecord | null
  reportSummary?: string
}

export async function generateLanding(
  templateId: TemplateId,
  ctx: LandingContext,
): Promise<GeneratedLanding> {
  const template = getTemplate(templateId)
  if (!template) throw new Error(`template_not_found: ${templateId}`)

  // Collect all slots from all sections
  const allSlots = template.sections.flatMap((s) => s.slots)
  if (allSlots.length === 0) {
    return {
      templateId,
      productName: ctx.productName,
      filledSlots: [],
      html: renderHtml(template, [], ctx),
      generatedAt: new Date().toISOString(),
      model: 'no-slots',
    }
  }

  // Fill all slots in a single LLM call for efficiency
  const filled = await fillSlots(template, allSlots, ctx)

  const html = renderHtml(template, filled.slots, ctx)

  return {
    templateId,
    productName: ctx.productName,
    filledSlots: filled.slots,
    html,
    generatedAt: new Date().toISOString(),
    model: filled.model,
  }
}

// ──────────────────────────────── Slot filling

async function fillSlots(
  template: LandingTemplate,
  slots: Array<{ id: string; label: string; type: string; hint: string }>,
  ctx: LandingContext,
): Promise<{ slots: FilledSlot[]; model: string }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    // Fallback: generate static content
    return {
      slots: slots.map((s) => ({
        slotId: s.id,
        content: fallbackContent(s, ctx),
      })),
      model: 'fallback-no-llm',
    }
  }

  const systemPrompt = `You are a conversion-focused landing page copywriter for iGaming marketing.

Generate content for each slot of a landing page template. Return ONLY valid JSON - an array of objects with "slotId" and "content" keys.

For "features" type slots, return a JSON string containing an array of feature objects: [{"icon":"emoji","title":"short","desc":"description"}]
For "testimonials" type slots, return a JSON string containing an array: [{"name":"Name","role":"Role","quote":"Quote","stars":5}]
For all other slots, return a plain text string.

Rules:
- Be specific to this product, not generic
- Use power words and action-oriented language
- Keep headlines under 8 words
- Keep CTAs under 4 words
- Match the brand's tone`

  const userMessage = buildSlotFillPrompt(template, slots, ctx)

  const result = await callLLM({
    model: LANDING_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    caller: 'landingGenerator',
    action: 'fill_slots',
    temperature: 0.4,
    maxTokens: 2000,
    responseFormat: 'json',
    timeoutMs: 30_000,
  })

  const content = result.content
  if (!content) throw new Error('landing_llm_empty')

  // LLMs sometimes wrap JSON in ```json ... ``` fences or add preamble.
  // Try direct parse first; fall back to extracting the first {...} or [...] block.
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidate = fenceMatch ? fenceMatch[1] : content
    const objMatch = candidate.match(/[\[{][\s\S]*[\]}]/)
    if (!objMatch) throw new Error('landing_llm_invalid_json')
    try {
      parsed = JSON.parse(objMatch[0])
    } catch {
      throw new Error('landing_llm_invalid_json')
    }
  }

  // Handle both { slots: [...] } and bare [...]
  const arr = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>).slots
  if (!Array.isArray(arr)) throw new Error('landing_llm_bad_shape')

  const filledSlots: FilledSlot[] = arr.map((item: Record<string, unknown>) => ({
    slotId: String(item.slotId || item.slot_id || ''),
    content: String(item.content || ''),
  }))

  return { slots: filledSlots, model: result.model }
}

function buildSlotFillPrompt(
  template: LandingTemplate,
  slots: Array<{ id: string; label: string; type: string; hint: string }>,
  ctx: LandingContext,
): string {
  const parts: string[] = []

  parts.push(`## Product: ${ctx.productName}`)
  parts.push(`URL: ${ctx.productUrl}`)
  if (ctx.vertical) parts.push(`Vertical: ${ctx.vertical}`)

  if (ctx.enrichment?.extracted) {
    const e = ctx.enrichment.extracted
    if (e.tagline) parts.push(`Tagline: ${e.tagline}`)
    if (e.valueProps.length) parts.push(`Value Props: ${e.valueProps.join('; ')}`)
    if (e.tone) parts.push(`Tone: ${e.tone}`)
    if (e.featuresHighlighted.length) parts.push(`Features: ${e.featuresHighlighted.join(', ')}`)
    if (e.cta.length) parts.push(`Existing CTAs: ${e.cta.join(', ')}`)
  }

  if (ctx.reportSummary) {
    parts.push(`\n## Report Summary\n${ctx.reportSummary}`)
  }

  parts.push(`\n## Template: ${template.name}`)
  parts.push(`Color scheme: primary=${template.colorScheme.primary}, bg=${template.colorScheme.background}`)

  parts.push(`\n## Slots to fill:`)
  for (const slot of slots) {
    parts.push(`- slotId: "${slot.id}" | type: ${slot.type} | hint: ${slot.hint}`)
  }

  parts.push(`\nReturn JSON: { "slots": [ { "slotId": "...", "content": "..." }, ... ] }`)

  return parts.join('\n')
}

// ──────────────────────────────── Fallback content

function fallbackContent(
  slot: { id: string; type: string },
  ctx: LandingContext,
): string {
  switch (slot.type) {
    case 'headline': return `${ctx.productName} - Your Edge in ${ctx.vertical || 'iGaming'}`
    case 'subheadline': return ctx.enrichment?.extracted?.tagline || 'Experience the next level of online gaming'
    case 'cta': return 'Get Started'
    case 'body': return 'Join thousands of players who trust us for the best gaming experience.'
    case 'features': return JSON.stringify([
      { icon: '⚡', title: 'Fast Payouts', desc: 'Get your winnings quickly and securely' },
      { icon: '🎁', title: 'Welcome Bonus', desc: 'Start with extra credits on your first deposit' },
      { icon: '📱', title: 'Mobile First', desc: 'Play anywhere on any device' },
    ])
    case 'testimonials': return JSON.stringify([
      { name: 'Alex M.', role: 'Sports Bettor', quote: 'Best odds and fastest payouts I\'ve found.', stars: 5 },
      { name: 'Sarah K.', role: 'Casino Player', quote: 'The game selection is incredible.', stars: 5 },
    ])
    case 'image-prompt': return 'Modern iGaming promotional image with vibrant colors and dynamic composition'
    default: return ''
  }
}

// ──────────────────────────────── HTML renderer

function renderHtml(
  template: LandingTemplate,
  filledSlots: FilledSlot[],
  ctx: LandingContext,
): string {
  const slotMap = new Map(filledSlots.map((s) => [s.slotId, s.content]))
  const get = (id: string) => slotMap.get(id) || ''
  const c = template.colorScheme

  const sectionsHtml = template.sections.map((section) => {
    switch (section.type) {
      case 'hero': return renderHero(section, get, c)
      case 'features': return renderFeatures(section, get, c)
      case 'social-proof': return renderSocialProof(section, get, c)
      case 'cta-banner': return renderCtaBanner(section, get, c)
      case 'footer': return renderFooter(ctx, c)
      default: return ''
    }
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(ctx.productName)} - Landing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: ${c.text}; background: ${c.background}; line-height: 1.6; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .hero h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; margin-bottom: 16px; }
    .hero p { font-size: 1.25rem; opacity: 0.85; max-width: 600px; margin: 0 auto 32px; }
    .btn { display: inline-block; padding: 14px 36px; background: ${c.primary}; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 1.1rem; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: none; }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px ${c.primary}44; }
    .features { padding: 60px 0; }
    .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-top: 40px; }
    .feature-card { padding: 28px; border-radius: 12px; background: ${c.background === '#ffffff' ? '#f8fafc' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${c.background === '#ffffff' ? '#e2e8f0' : 'rgba(255,255,255,0.1)'}; }
    .feature-card .icon { font-size: 2rem; margin-bottom: 12px; }
    .feature-card h3 { font-size: 1.1rem; margin-bottom: 8px; }
    .feature-card p { font-size: 0.95rem; opacity: 0.8; }
    .social { padding: 60px 0; text-align: center; }
    .testimonials { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-top: 40px; }
    .testimonial { padding: 24px; border-radius: 12px; background: ${c.background === '#ffffff' ? '#f8fafc' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${c.background === '#ffffff' ? '#e2e8f0' : 'rgba(255,255,255,0.1)'}; text-align: left; }
    .testimonial .stars { color: #f59e0b; margin-bottom: 8px; }
    .testimonial .quote { font-style: italic; margin-bottom: 12px; font-size: 0.95rem; }
    .testimonial .author { font-weight: 600; font-size: 0.9rem; }
    .testimonial .role { font-size: 0.8rem; opacity: 0.6; }
    .cta-banner { padding: 60px 0; text-align: center; }
    .cta-banner h2 { font-size: 2rem; margin-bottom: 24px; }
    .footer { padding: 40px 0; text-align: center; font-size: 0.85rem; opacity: 0.5; border-top: 1px solid ${c.background === '#ffffff' ? '#e2e8f0' : 'rgba(255,255,255,0.1)'}; }
  </style>
</head>
<body>
${sectionsHtml}
</body>
</html>`
}

function renderHero(
  section: { slots: Array<{ id: string }> },
  get: (id: string) => string,
  c: LandingTemplate['colorScheme'],
): string {
  return `<section class="hero">
  <div class="container">
    <h1>${escHtml(get('headline'))}</h1>
    <p>${escHtml(get('subheadline'))}</p>
    ${get('hero_cta') ? `<a href="#" class="btn">${escHtml(get('hero_cta'))}</a>` : ''}
  </div>
</section>`
}

function renderFeatures(
  section: { slots: Array<{ id: string }> },
  get: (id: string) => string,
  c: LandingTemplate['colorScheme'],
): string {
  let features: Array<{ icon: string; title: string; desc: string }> = []
  try {
    features = JSON.parse(get('features_list'))
  } catch {
    features = [{ icon: '⚡', title: 'Feature', desc: 'Description' }]
  }

  const cards = features.map((f) => `
    <div class="feature-card">
      <div class="icon">${f.icon}</div>
      <h3>${escHtml(f.title)}</h3>
      <p>${escHtml(f.desc)}</p>
    </div>`).join('')

  return `<section class="features">
  <div class="container">
    <div class="features-grid">${cards}
    </div>
  </div>
</section>`
}

function renderSocialProof(
  section: { slots: Array<{ id: string }> },
  get: (id: string) => string,
  c: LandingTemplate['colorScheme'],
): string {
  let testimonials: Array<{ name: string; role: string; quote: string; stars: number }> = []
  try {
    testimonials = JSON.parse(get('testimonials'))
  } catch {
    testimonials = []
  }

  const cards = testimonials.map((t) => `
    <div class="testimonial">
      <div class="stars">${'★'.repeat(t.stars || 5)}</div>
      <div class="quote">"${escHtml(t.quote)}"</div>
      <div class="author">${escHtml(t.name)}</div>
      <div class="role">${escHtml(t.role)}</div>
    </div>`).join('')

  return `<section class="social">
  <div class="container">
    <h2>What Our Users Say</h2>
    <div class="testimonials">${cards}
    </div>
  </div>
</section>`
}

function renderCtaBanner(
  section: { slots: Array<{ id: string }> },
  get: (id: string) => string,
  c: LandingTemplate['colorScheme'],
): string {
  return `<section class="cta-banner">
  <div class="container">
    <h2>${escHtml(get('bottom_headline'))}</h2>
    <a href="#" class="btn">${escHtml(get('bottom_cta') || 'Get Started')}</a>
  </div>
</section>`
}

function renderFooter(ctx: LandingContext, c: LandingTemplate['colorScheme']): string {
  return `<footer class="footer">
  <div class="container">
    <p>&copy; ${new Date().getFullYear()} ${escHtml(ctx.productName)}. All rights reserved.</p>
    <p style="margin-top:8px">Generated by Moboost AI</p>
  </div>
</footer>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
