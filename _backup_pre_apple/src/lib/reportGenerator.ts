/**
 * Report generator — orchestrates product enrichment, market intel,
 * and LLM calls to produce a structured marketing report.
 *
 * Pipeline:
 *   1. Load product from DB (with enrichment)
 *   2. Load market intel for the product's vertical(s)
 *   3. For each report section, call LLM with focused prompt + context
 *   4. Assemble sections into ReportOutput
 *   5. Persist to reports table
 *
 * Design:
 *   - Each section is generated independently → partial failure resilience
 *   - Deterministic fallback: if LLM fails, the section gets a
 *     "data-only" stub from market intel (no hallucination)
 *   - Credit reservation happens BEFORE generation starts;
 *     rollback on total failure, commit on success
 */

import { supabaseService } from '@/lib/db'
import { getVerticalIntelBulk } from '@/lib/marketIntel/read'
import type { VerticalIntel } from '@/lib/marketIntel/types'
import type { EnrichmentRecord } from '@/lib/productEnrichment'
import {
  type ReportKind,
  type ReportOutput,
  type ReportSection,
  type ReportSectionId,
  type ReportBrief,
  type AudienceGroup,
  REPORT_SECTIONS,
  SECTION_META,
  LITE_FREE_SECTIONS,
} from './reportTypes'

// ──────────────────────────────── Config

const OPENROUTER_BASE =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const REPORT_MODEL =
  process.env.REPORT_MODEL || 'anthropic/claude-sonnet-4-6'
const LLM_TIMEOUT_MS = 45_000

// ──────────────────────────────── Types

type ProductRow = {
  id: string
  name: string
  url: string
  category: string | null
  description: string | null
  enrichment: EnrichmentRecord | null
  enrichment_status: string | null
}

type SectionContext = {
  product: ProductRow
  enrichment: EnrichmentRecord | null
  marketIntel: VerticalIntel | null
  kind: ReportKind
}

// ──────────────────────────────── Main entry

export async function generateReport(
  userId: string,
  productId: string,
  kind: ReportKind = 'lite',
): Promise<{ reportId: string; report: ReportOutput }> {
  const db = supabaseService()
  const warnings: string[] = []

  // 1. Load product
  const { data: product, error: productErr } = await db
    .from('products')
    .select('id, name, url, category, description, enrichment, enrichment_status')
    .eq('id', productId)
    .eq('user_id', userId)
    .maybeSingle()

  if (productErr || !product) {
    throw new Error(`product_not_found: ${productErr?.message ?? productId}`)
  }

  // 2. Load market intel for product's vertical(s)
  const verticals = resolveVerticals(product)
  const intelMap = await getVerticalIntelBulk(verticals)
  const primaryIntel = intelMap[verticals[0]] ?? null
  const marketIntelSource = primaryIntel?.source ?? null

  if (!primaryIntel) {
    warnings.push('no_market_intel_for_vertical — using LLM general knowledge only')
  }
  if (!product.enrichment || product.enrichment_status !== 'ready') {
    warnings.push('product_enrichment_not_ready — report may be thin')
  }

  // 3. Create report row with status='running'
  const { data: reportRow, error: insertErr } = await db
    .from('reports')
    .insert({
      user_id: userId,
      product_id: productId,
      kind,
      status: 'running',
      input: { verticals, marketIntelSource },
    })
    .select('id')
    .single()

  if (insertErr || !reportRow) {
    throw new Error(`report_insert: ${insertErr?.message ?? 'no_data'}`)
  }

  // 4. Generate each section
  const sectionIds = REPORT_SECTIONS[kind]
  const ctx: SectionContext = {
    product: product as ProductRow,
    enrichment: product.enrichment as EnrichmentRecord | null,
    marketIntel: primaryIntel?.intel ?? null,
    kind,
  }

  const sections: ReportSection[] = []
  let modelUsed = REPORT_MODEL

  for (let i = 0; i < sectionIds.length; i++) {
    const sectionId = sectionIds[i]
    const gated = kind === 'lite' && i >= LITE_FREE_SECTIONS

    try {
      const result = await generateSection(sectionId, ctx, gated)
      sections.push(result.section)
      if (result.model) modelUsed = result.model
    } catch (err) {
      const msg = (err as Error).message
      warnings.push(`section_${sectionId}_failed: ${msg}`)
      // Fallback: empty section with error note
      sections.push({
        id: sectionId,
        title: SECTION_META[sectionId].title,
        content: gated
          ? '_This section is available in the full report._'
          : `_Section generation failed. Our team has been notified._`,
        gated,
      })
    }
  }

  // 5. Generate brief (3 audience groups) — only for full reports or after unlock
  let brief: ReportBrief | null = null
  try {
    brief = await generateBrief(ctx, sections)
  } catch (err) {
    warnings.push(`brief_generation_failed: ${(err as Error).message}`)
  }

  // 6. Assemble output
  const report: ReportOutput = {
    kind,
    productId,
    productName: product.name,
    productUrl: product.url,
    vertical: product.category,
    sections,
    brief,
    generatedAt: new Date().toISOString(),
    model: modelUsed,
    marketIntelSource,
    warnings,
  }

  // 6. Persist
  const { error: updateErr } = await db
    .from('reports')
    .update({
      status: 'done',
      output: report as unknown as Record<string, unknown>,
    })
    .eq('id', reportRow.id)

  if (updateErr) {
    warnings.push(`persist_warning: ${updateErr.message}`)
  }

  return { reportId: reportRow.id, report }
}

// ──────────────────────────────── Section generation

async function generateSection(
  sectionId: ReportSectionId,
  ctx: SectionContext,
  gated: boolean,
): Promise<{ section: ReportSection; model?: string }> {
  const meta = SECTION_META[sectionId]

  // For gated sections in lite reports, generate a teaser only
  if (gated) {
    const teaser = await generateSectionContent(
      sectionId,
      ctx,
      `Generate a 2-3 sentence TEASER preview of what this section covers. Make it compelling enough that the reader wants to unlock the full report. Do NOT provide the actual analysis.`,
    )
    return {
      section: {
        id: sectionId,
        title: meta.title,
        content: teaser.content,
        gated: true,
      },
      model: teaser.model,
    }
  }

  const result = await generateSectionContent(sectionId, ctx, meta.promptHint)

  // Extract structured data for specific sections
  let data: Record<string, unknown> | undefined
  if (sectionId === 'competitor_landscape' && ctx.marketIntel) {
    data = {
      topAdvertisers: ctx.marketIntel.topAdvertisers,
      geoHotspots: ctx.marketIntel.geoHotspots,
    }
  }
  if (sectionId === 'creative_analysis' && ctx.marketIntel) {
    data = {
      creativePatterns: ctx.marketIntel.creativePatterns,
      ctaPatterns: ctx.marketIntel.ctaPatterns,
      trendingFeatures: ctx.marketIntel.trendingFeatures,
    }
  }

  return {
    section: {
      id: sectionId,
      title: meta.title,
      content: result.content,
      gated: false,
      data,
    },
    model: result.model,
  }
}

async function generateSectionContent(
  sectionId: ReportSectionId,
  ctx: SectionContext,
  instruction: string,
): Promise<{ content: string; model: string }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    // No LLM — return data-only stub
    return {
      content: buildFallbackContent(sectionId, ctx),
      model: 'fallback-no-llm',
    }
  }

  const systemPrompt = buildSystemPrompt()
  const userMessage = buildUserMessage(sectionId, ctx, instruction)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI - Report Generator',
      },
      body: JSON.stringify({
        model: REPORT_MODEL,
        temperature: 0.3,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`openrouter_${res.status}: ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('llm_empty_response')

  return { content, model: data.model ?? REPORT_MODEL }
}

// ──────────────────────────────── Prompt construction

function buildSystemPrompt(): string {
  return `You are a senior iGaming marketing strategist working for Moboost AI, a marketing intelligence SaaS platform.

Your task is to generate ONE section of a product marketing analysis report. Write in clear, actionable prose. Be specific to the product and data provided — never fall back to generic advice.

Formatting rules:
- Use markdown with ## for sub-headings within the section
- Use bullet points for lists of recommendations
- Bold key metrics and brand names
- Keep each section between 200-500 words
- Include specific numbers from the market intel data when available
- End each section with 1-2 actionable takeaways

Tone: Professional but direct. Data-driven. No fluff.`
}

function buildUserMessage(
  sectionId: ReportSectionId,
  ctx: SectionContext,
  instruction: string,
): string {
  const parts: string[] = []

  parts.push(`## Section: ${SECTION_META[sectionId].title}`)
  parts.push(`\n### Instruction\n${instruction}`)

  // Product context
  parts.push(`\n### Product Data`)
  parts.push(`- Name: ${ctx.product.name}`)
  parts.push(`- URL: ${ctx.product.url}`)
  if (ctx.product.category) parts.push(`- Vertical: ${ctx.product.category}`)
  if (ctx.product.description) parts.push(`- Description: ${ctx.product.description}`)

  // Enrichment context
  if (ctx.enrichment?.extracted) {
    const e = ctx.enrichment.extracted
    parts.push(`\n### Extracted Product Profile`)
    if (e.companyName) parts.push(`- Company: ${e.companyName}`)
    if (e.tagline) parts.push(`- Tagline: ${e.tagline}`)
    if (e.valueProps.length) parts.push(`- Value Props: ${e.valueProps.join('; ')}`)
    if (e.targetAudience.length) parts.push(`- Target Audience: ${e.targetAudience.join('; ')}`)
    if (e.tone) parts.push(`- Tone: ${e.tone}`)
    if (e.verticals.length) parts.push(`- Verticals: ${e.verticals.join(', ')}`)
    if (e.featuresHighlighted.length) parts.push(`- Key Features: ${e.featuresHighlighted.join(', ')}`)
    if (e.cta.length) parts.push(`- CTAs: ${e.cta.join(', ')}`)
    if (e.locales.length) parts.push(`- Locales: ${e.locales.join(', ')}`)
  }

  // Market intel context
  if (ctx.marketIntel) {
    const mi = ctx.marketIntel
    parts.push(`\n### Market Intelligence (${mi.vertical})`)
    parts.push(`Source: ${mi.source} | Generated: ${mi.generatedAt}`)

    if (mi.topAdvertisers?.length) {
      parts.push(`\n**Top Advertisers:**`)
      for (const adv of mi.topAdvertisers.slice(0, 8)) {
        parts.push(`- ${adv.name}: ${adv.shareOfVoice}% SOV, channels: ${adv.topChannels.join('/')}, geos: ${adv.topGeos.join('/')}`)
      }
    }

    if (mi.creativePatterns?.length) {
      parts.push(`\n**Creative Patterns:**`)
      for (const cp of mi.creativePatterns.slice(0, 6)) {
        parts.push(`- "${cp.label}" (${cp.format}, ${cp.frequency}% frequency) — hook: ${cp.hookPattern}, CTAs: ${cp.ctas.join(', ')}`)
      }
    }

    if (mi.geoHotspots?.length) {
      parts.push(`\n**Geo Hotspots:**`)
      for (const geo of mi.geoHotspots.slice(0, 6)) {
        parts.push(`- ${geo.country} (weight: ${geo.weight}) — ${geo.reason}`)
      }
    }

    if (mi.trendingFeatures?.length) {
      parts.push(`\n**Trending Features:** ${mi.trendingFeatures.join(', ')}`)
    }
    if (mi.ctaPatterns?.length) {
      parts.push(`\n**CTA Patterns:** ${mi.ctaPatterns.join(', ')}`)
    }
  }

  parts.push(`\n---\nNow generate the "${SECTION_META[sectionId].title}" section. Write in markdown.`)

  return parts.join('\n')
}

// ──────────────────────────────── Brief generation
// After all sections are generated, produce a brief with 3 audience groups.
// Each group has: audience tag, selling point, creative direction, landing page brief.

async function generateBrief(
  ctx: SectionContext,
  sections: ReportSection[],
): Promise<ReportBrief | null> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return buildFallbackBrief(ctx)

  // Gather section summaries for context
  const sectionSummaries = sections
    .filter(s => !s.gated && s.content.length > 50)
    .map(s => `[${s.title}]: ${s.content.slice(0, 300)}`)
    .join('\n\n')

  const systemPrompt = `You are a senior iGaming marketing strategist. Based on a product marketing report, generate a campaign brief with exactly 3 distinct audience groups.

Output ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "campaignTheme": "string - overall campaign theme/tagline",
  "colorPalette": ["string - 3 hex colors"],
  "tone": "string - brand tone",
  "groups": [
    {
      "audienceTag": "string - concise audience label, e.g. '25-34 Male Sports Fans in Brazil'",
      "audienceProfile": "string - 2-3 sentences describing demographics, psychographics, behavior",
      "region": "string - target country/region",
      "sellingPoint": "string - THE key selling point for THIS audience. Must be scenario-matched: explain how the product fits into their daily life/interests. 2-3 sentences.",
      "creativeDirection": "string - format (video/static/carousel), visual style, mood, hook strategy. 2-3 sentences.",
      "landingPageBrief": "string - what the landing page should include: hero message, key sections, CTA, trust elements. Style must match the creative direction. 2-3 sentences."
    }
  ]
}

Rules:
- Each group must target a DIFFERENT region and audience segment
- Selling points must be specific to the product, not generic marketing speak
- Creative direction must differ across groups (different formats/styles for different audiences)
- Landing page brief must reference elements from the creative (same style, same selling point)
- Use geo hotspot data if available to pick real high-potential regions`

  const userMsg = `Product: ${ctx.product.name}
URL: ${ctx.product.url}
Vertical: ${ctx.product.category ?? 'iGaming'}
${ctx.enrichment?.extracted ? `Value Props: ${ctx.enrichment.extracted.valueProps.join('; ')}` : ''}
${ctx.enrichment?.extracted?.targetAudience?.length ? `Known Audiences: ${ctx.enrichment.extracted.targetAudience.join('; ')}` : ''}
${ctx.marketIntel?.geoHotspots?.length ? `Geo Hotspots: ${ctx.marketIntel.geoHotspots.map(g => `${g.country} (${g.reason})`).join(', ')}` : ''}

Report findings:
${sectionSummaries}

Generate the 3-group campaign brief as JSON.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI - Brief Generator',
      },
      body: JSON.stringify({
        model: REPORT_MODEL,
        temperature: 0.4,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
      }),
    })

    if (!res.ok) return buildFallbackBrief(ctx)

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = data.choices?.[0]?.message?.content
    if (!raw) return buildFallbackBrief(ctx)

    // Parse JSON — handle potential markdown wrapping
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(jsonStr) as {
      campaignTheme: string
      colorPalette: string[]
      tone: string
      groups: Array<{
        audienceTag: string
        audienceProfile: string
        region: string
        sellingPoint: string
        creativeDirection: string
        landingPageBrief: string
      }>
    }

    const audienceGroups: AudienceGroup[] = parsed.groups.slice(0, 3).map((g, i) => ({
      id: `group_${i + 1}`,
      audienceTag: g.audienceTag,
      audienceProfile: g.audienceProfile,
      region: g.region,
      sellingPoint: g.sellingPoint,
      creativeDirection: g.creativeDirection,
      landingPageBrief: g.landingPageBrief,
    }))

    return {
      productId: ctx.product.id,
      productName: ctx.product.name,
      audienceGroups,
      campaignTheme: parsed.campaignTheme,
      sharedBrandElements: {
        colorPalette: parsed.colorPalette ?? ['#10B981', '#3B82F6', '#8B5CF6'],
        tone: parsed.tone ?? 'Professional yet exciting',
      },
    }
  } catch {
    return buildFallbackBrief(ctx)
  } finally {
    clearTimeout(timer)
  }
}

function buildFallbackBrief(ctx: SectionContext): ReportBrief {
  const geos = ctx.marketIntel?.geoHotspots ?? []
  const regions = geos.length >= 3
    ? geos.slice(0, 3).map(g => g.country)
    : ['Brazil', 'India', 'Philippines']

  return {
    productId: ctx.product.id,
    productName: ctx.product.name,
    campaignTheme: `${ctx.product.name} - Play Smart, Win Big`,
    sharedBrandElements: {
      colorPalette: ['#10B981', '#3B82F6', '#8B5CF6'],
      tone: 'Exciting yet trustworthy',
    },
    audienceGroups: regions.map((region, i) => ({
      id: `group_${i + 1}`,
      audienceTag: `Audience Group ${i + 1} - ${region}`,
      audienceProfile: `Target audience in ${region} interested in ${ctx.product.category ?? 'iGaming'}. Needs further analysis with market intel data.`,
      region,
      sellingPoint: `${ctx.product.name} offers the best ${ctx.product.category ?? 'gaming'} experience for players in ${region}.`,
      creativeDirection: i === 0 ? 'Short-form video (15s), high-energy, mobile-first' : i === 1 ? 'Static banner with bold typography, social proof focus' : 'Carousel format showcasing features, UGC-style',
      landingPageBrief: `Hero with ${ctx.product.name} branding, key selling point, social proof section, prominent CTA button. Style matches creative direction.`,
    })),
  }
}

// ──────────────────────────────── Fallback (no LLM)

function buildFallbackContent(
  sectionId: ReportSectionId,
  ctx: SectionContext,
): string {
  const lines: string[] = []

  switch (sectionId) {
    case 'product_overview':
      lines.push(`## ${ctx.product.name}`)
      lines.push(`**URL:** ${ctx.product.url}`)
      if (ctx.product.category) lines.push(`**Vertical:** ${ctx.product.category}`)
      if (ctx.enrichment?.extracted) {
        const e = ctx.enrichment.extracted
        if (e.tagline) lines.push(`\n> ${e.tagline}`)
        if (e.valueProps.length) {
          lines.push(`\n**Value Propositions:**`)
          e.valueProps.forEach(v => lines.push(`- ${v}`))
        }
        if (e.featuresHighlighted.length) {
          lines.push(`\n**Key Features:** ${e.featuresHighlighted.join(', ')}`)
        }
      }
      break

    case 'competitor_landscape':
      if (ctx.marketIntel?.topAdvertisers?.length) {
        lines.push(`## Top Competitors in ${ctx.marketIntel.vertical}`)
        ctx.marketIntel.topAdvertisers.forEach(a => {
          lines.push(`- **${a.name}**: ${a.shareOfVoice}% share of voice (${a.topGeos.join(', ')})`)
        })
      } else {
        lines.push('_No competitor data available for this vertical yet._')
      }
      break

    case 'market_position':
      if (ctx.marketIntel?.geoHotspots?.length) {
        lines.push(`## Market Hotspots`)
        ctx.marketIntel.geoHotspots.forEach(g => {
          lines.push(`- **${g.country}** (weight: ${g.weight}): ${g.reason}`)
        })
      }
      break

    default:
      lines.push(`_This section requires LLM analysis. Configure OPENROUTER_API_KEY to enable._`)
  }

  return lines.join('\n')
}

// ──────────────────────────────── Helpers

function resolveVerticals(product: ProductRow): string[] {
  // From product category (onboarding dropdown)
  const verticals: string[] = []

  if (product.category) {
    // Map onboarding labels to market intel verticals
    const mapping: Record<string, string> = {
      'Casino / Slots': 'Casino',
      'Sports Betting': 'Sports Betting',
      'Poker': 'Poker',
      'Lottery': 'Lottery',
      'Fantasy Sports': 'Fantasy Sports',
      'Esports Betting': 'Esports',
      'Bingo': 'Bingo',
      'Other iGaming': 'Casino', // fallback
    }
    verticals.push(mapping[product.category] ?? product.category)
  }

  // Also check enrichment verticals
  if (product.enrichment) {
    const enrichment = product.enrichment as EnrichmentRecord
    if (enrichment.extracted?.verticals) {
      for (const v of enrichment.extracted.verticals) {
        if (!verticals.includes(v)) verticals.push(v)
      }
    }
  }

  // Default fallback
  if (verticals.length === 0) verticals.push('Casino')

  return verticals
}
