/**
 * Seed script: Save Thrillzz "Kinetic Tension" brand visual style to industry_knowledge
 *
 * Run from project root:
 *   npx tsx scripts/seed-thrillzz-style.ts
 *
 * Or via ts-node:
 *   npx ts-node --esm scripts/seed-thrillzz-style.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

const PHILOSOPHY = `Kinetic Tension — A visual philosophy of suspended motion, the charged instant between cause and consequence, rendered through meticulous geometric systems that vibrate with restrained energy.

SPACE & FORM: Every composition exists in the fraction of a second before release. Form carries velocity — angled geometries, converging sight-lines, repeating elements that accelerate across the field. Nothing is static. Even negative space feels pressurized.

COLOR: Palette severely restricted — dominant deep almost-black field (#06060c) punctuated by exactly two high-frequency chromatic accents: Electric Orange-Red (#ff4410, #ff8232) and Cyan (#00d2ff, #006496). Accents are load-bearing, not decorative. Like a single neon filament in a dark stadium.

SCALE & RHYTHM: Elements repeat but transform — circles become arcs become trajectories become vanishing points. Syncopated rhythm: dense clusters give way to sudden expanses, then snap back to density. Push-pull cadence mirrors anticipation.

TYPOGRAPHY: Sparse, clinical, lowercase. Exists as specimen notation — thin sans-serif labels cataloguing forces at play. Words are rare surgical instruments. Fonts: Jura (Light/Medium) for labels, GeistMono for data, BigShoulders Bold for titles, InstrumentSerif Italic for accents.

COMPOSITION: Follows field diagram / probability map logic. Canvas as coordinate system with invisible axes. Grid alignment sacred but not rigid — breaks only at calculated moments of maximum tension. Sparse crosshairs, reference numbers, dashed orbital rings. The visual language of systematic observation.`

const STRUCTURED = {
  movementName: 'Kinetic Tension',
  primaryColors: {
    background: '#06060c',
    accentPrimary: '#ff4410',
    accentPrimaryLight: '#ff8232',
    accentSecondary: '#00d2ff',
    accentSecondaryDim: '#006496',
    gridMajor: '#1c1c30',
    gridMinor: '#0c0c16',
    textDim: '#464670',
    textMed: '#646496',
    textBright: '#a0a0d2',
  },
  typography: {
    titleFont: 'BigShoulders Bold',
    labelFont: 'Jura Light/Medium',
    dataFont: 'GeistMono',
    accentFont: 'InstrumentSerif Italic',
    bodyFont: 'Italiana / PoiretOne / WorkSans',
    textTreatment: 'sparse, clinical, lowercase, specimen notation',
  },
  visualElements: {
    trajectoryArcs: 'Spiral arcs with fade, orange-red primary, cyan secondary',
    probabilityClouds: 'Gaussian dot distributions with ring structure, hot core to dim halo',
    spectrographicBands: 'Vertical mark clusters at key Y positions, variable height',
    orbitalRings: 'Dashed concentric circles around focal and satellite nodes',
    nodeMarkers: 'Compound markers: double ring + crosshair + center dot + Greek letter labels',
    thresholdLines: 'Horizontal accent lines with bright pulse segments',
    gridSystem: '60px grid with 120px/240px hierarchy levels',
    convergenceRays: 'Lines from edges toward focal point, stopping at 20-42%',
  },
  designPrinciples: [
    'Suspended motion — everything exists at the apex before release',
    'Voltage color — accents are electric discharge, not decoration',
    'Syncopated density — clusters alternate with breathing room',
    'Field observation aesthetic — between star chart, tactical overlay, and musical score',
    'Minimal text — words as rare surgical instruments',
    'Systematic observation — treating ephemeral thrill with scientific reverence',
  ],
  applicationGuidance: {
    forImages:
      'Dark field with trajectory arcs converging on product/feature. Probability dot cloud at focal point. Spectrographic mark bands as visual rhythm. Minimal clinical labels. Colors: deep black + orange-red accent + cyan secondary.',
    forVideo:
      'Motion along trajectory arcs, particles coalescing into probability cloud, threshold lines pulsing, dots appearing in ring patterns. Dark-to-accent color reveals. Thin typography appearing as specimen labels.',
    forLandingPage:
      'Dark background (#06060c), grid overlay subtle, accent color CTAs in orange-red, data/stats in cyan, minimal sans-serif typography, generous negative space, animated trajectory arcs on scroll, probability cloud as hero visual.',
  },
  brandContext: {
    brand: 'Thrillzz',
    industry: 'iGaming / Social Sportsbook',
    essence: 'The thrill of prediction, anticipation of outcomes, competitive energy',
    subtleReference:
      'Sports prediction trajectories, probability distributions, the electric moment before results',
  },
}

async function main() {
  console.log('Saving Thrillzz brand style to industry_knowledge...')

  // Check for existing entry
  const { data: existing } = await supabase
    .from('industry_knowledge')
    .select('id')
    .eq('title', 'Thrillzz Brand Visual Style — Kinetic Tension')
    .eq('status', 'active')
    .limit(1)

  if (existing && existing.length > 0) {
    const oldId = existing[0].id
    console.log(`Found existing entry ${oldId}, superseding...`)
    await supabase
      .from('industry_knowledge')
      .update({ status: 'superseded' })
      .eq('id', oldId)
  }

  const { data, error } = await supabase
    .from('industry_knowledge')
    .insert({
      category: 'best_practice',
      vertical: 'social_sportsbook',
      region: 'global',
      tags: [
        'thrillzz',
        'brand_style',
        'design_philosophy',
        'kinetic_tension',
        'visual_identity',
        'creative_direction',
        'dark_theme',
        'igaming',
      ],
      title: 'Thrillzz Brand Visual Style — Kinetic Tension',
      summary:
        'Design philosophy for Thrillzz (social sportsbook): "Kinetic Tension" — dark field aesthetic with electric orange-red (#ff4410) and cyan (#00d2ff) accents, trajectory arcs, probability clouds, spectrographic bands, clinical typography. Guides image, video, and landing page generation.',
      full_content: PHILOSOPHY,
      structured: STRUCTURED,
      source_type: 'manual',
      source_url: 'https://thrillzz.com/',
      source_query: 'thrillzz brand visual style design philosophy',
      confidence: 0.95,
      relevance: 0.95,
      freshness: 1.0,
      status: 'active',
      collected_by: 'claude_cowork',
    })
    .select('id, title, category, tags')
    .single()

  if (error) {
    console.error('Failed:', error.message)
    process.exit(1)
  }

  console.log('✅ Saved successfully!')
  console.log(`   ID: ${data.id}`)
  console.log(`   Title: ${data.title}`)
  console.log(`   Category: ${data.category}`)
  console.log(`   Tags: ${data.tags.join(', ')}`)
  console.log('')
  console.log('Usage in code:')
  console.log('  import { queryKnowledge } from "@/agents/evolution/intelligence/store"')
  console.log('  const styles = await queryKnowledge({ tags: ["thrillzz", "brand_style"] })')
  console.log('  const thrillzzStyle = styles[0]?.structured')
}

main().catch(console.error)
