/**
 * POST /api/brief/execute
 *
 * Executes a campaign brief — for each audience group, generates:
 *   1. A creative asset (via LLM prompt → concept + copy)
 *   2. A landing page (HTML via LLM)
 *
 * Input: { reportId, productId, audienceGroups: AudienceGroup[] }
 * Output: { ok, results: [{ groupId, creative, landingPageHtml }] }
 *
 * Demo stage: 3 groups × (1 creative + 1 landing page) = 3 sets
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseService } from '@/lib/db'
import type { AudienceGroup } from '@/lib/reportTypes'

export const maxDuration = 120

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const MODEL = process.env.REPORT_MODEL || 'anthropic/claude-sonnet-4-6'

type ExecRequest = {
  reportId: string
  productId: string
  audienceGroups: AudienceGroup[]
}

type GroupResult = {
  groupId: string
  audienceTag: string
  region: string
  creative: {
    headline: string
    bodyCopy: string
    ctaText: string
    format: string
    visualDescription: string
  }
  landingPageHtml: string
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const db = supabaseService()
    const { data: userRow } = await db.from('users').select('id').eq('clerk_user_id', clerkId).maybeSingle()
    if (!userRow) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    const body = (await req.json()) as ExecRequest
    const { reportId, productId, audienceGroups } = body

    if (!reportId || !productId || !audienceGroups?.length) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }

    // Load product for context
    const { data: product } = await db
      .from('products')
      .select('name, url, category, description')
      .eq('id', productId)
      .eq('user_id', userRow.id)
      .maybeSingle()

    if (!product) return NextResponse.json({ ok: false, error: 'product_not_found' }, { status: 404 })

    // Generate for each audience group (sequentially to avoid rate limits)
    const results: GroupResult[] = []

    for (const group of audienceGroups.slice(0, 3)) {
      const [creative, landingPageHtml] = await Promise.all([
        generateCreative(product, group),
        generateLandingPage(product, group),
      ])

      results.push({
        groupId: group.id,
        audienceTag: group.audienceTag,
        region: group.region,
        creative,
        landingPageHtml,
      })

      // Persist landing page
      await db.from('landing_pages').insert({
        user_id: userRow.id,
        product_id: productId,
        report_id: reportId,
        template_id: `brief_${group.id}`,
        filled_slots: {
          audienceTag: group.audienceTag,
          region: group.region,
          sellingPoint: group.sellingPoint,
        },
        html: landingPageHtml,
        model: MODEL,
        status: 'done',
      }).select('id').single()
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('[brief/execute]', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

/* ── Creative Generation ── */

async function generateCreative(
  product: { name: string; url: string; category: string | null; description: string | null },
  group: AudienceGroup,
) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    return {
      headline: `${product.name} - Built for ${group.region}`,
      bodyCopy: group.sellingPoint,
      ctaText: 'Play Now',
      format: group.creativeDirection.split(',')[0] || 'Static Banner',
      visualDescription: `Product showcase featuring ${product.name} tailored for ${group.audienceTag}`,
    }
  }

  const prompt = `Generate a marketing creative concept for:

Product: ${product.name} (${product.url})
Category: ${product.category || 'iGaming'}
Target Audience: ${group.audienceTag}
Region: ${group.region}
Selling Point: ${group.sellingPoint}
Creative Direction: ${group.creativeDirection}

Output ONLY valid JSON:
{
  "headline": "string - max 8 words, punchy, localized feel",
  "bodyCopy": "string - 2-3 sentences, benefit-focused, matches audience",
  "ctaText": "string - 2-4 words, action-oriented",
  "format": "string - specific format: 15s Video / Static Banner / Carousel / UGC-style",
  "visualDescription": "string - describe the visual: colors, imagery, mood, layout"
}`

  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI - Creative Gen',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error(`LLM ${res.status}`)
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content || ''
    const json = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(json)
  } catch {
    return {
      headline: `${product.name} - Built for ${group.region}`,
      bodyCopy: group.sellingPoint,
      ctaText: 'Play Now',
      format: 'Static Banner',
      visualDescription: `Product showcase for ${group.audienceTag}`,
    }
  }
}

/* ── Landing Page Generation ── */

async function generateLandingPage(
  product: { name: string; url: string; category: string | null; description: string | null },
  group: AudienceGroup,
) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return buildFallbackLandingPage(product, group)

  const prompt = `Generate a complete, self-contained HTML landing page for:

Product: ${product.name} (${product.url})
Category: ${product.category || 'iGaming'}
Target Audience: ${group.audienceTag}
Region: ${group.region}
Selling Point: ${group.sellingPoint}
Landing Page Brief: ${group.landingPageBrief}
Creative Style: ${group.creativeDirection}

Requirements:
- Single HTML file with inline CSS (no external dependencies)
- Apple-inspired design: black/white sections, clean typography, generous whitespace
- Hero section with product name and selling point
- Social proof section
- Feature highlights matching the selling point
- Strong CTA button matching the creative direction
- Mobile-responsive
- The visual style must match the creative direction (same colors, mood, tone)

Output ONLY the complete HTML. No explanation.`

  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI - Landing Gen',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error(`LLM ${res.status}`)
    const data = await res.json()
    let html = data.choices?.[0]?.message?.content || ''
    // Strip markdown code fences if present
    html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim()
    if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
      return buildFallbackLandingPage(product, group)
    }
    return html
  } catch {
    return buildFallbackLandingPage(product, group)
  }
}

function buildFallbackLandingPage(
  product: { name: string; url: string; category: string | null },
  group: AudienceGroup,
) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${product.name} - ${group.region}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif;color:#1d1d1f}
    .hero{background:#000;color:#fff;padding:80px 24px;text-align:center}
    .hero h1{font-size:48px;font-weight:600;line-height:1.07;letter-spacing:-0.28px;margin-bottom:16px}
    .hero p{font-size:21px;font-weight:400;line-height:1.19;color:rgba(255,255,255,.7);max-width:600px;margin:0 auto 32px}
    .hero a{display:inline-block;background:#0071e3;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:17px}
    .features{background:#f5f5f7;padding:60px 24px;text-align:center}
    .features h2{font-size:40px;font-weight:600;line-height:1.10;margin-bottom:32px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;max-width:980px;margin:0 auto}
    .card{background:#fff;border-radius:12px;padding:32px 24px;box-shadow:rgba(0,0,0,.06) 0 2px 12px}
    .card h3{font-size:21px;font-weight:600;margin-bottom:8px}
    .card p{font-size:14px;line-height:1.43;color:rgba(0,0,0,.6)}
    .cta{background:#000;color:#fff;padding:60px 24px;text-align:center}
    .cta h2{font-size:40px;font-weight:600;margin-bottom:16px}
    .cta a{display:inline-block;background:#0071e3;color:#fff;padding:14px 32px;border-radius:980px;text-decoration:none;font-size:17px}
  </style>
</head>
<body>
  <section class="hero">
    <h1>${product.name}</h1>
    <p>${group.sellingPoint}</p>
    <a href="${product.url}">Get Started</a>
  </section>
  <section class="features">
    <h2>Why ${group.audienceTag} Choose Us</h2>
    <div class="grid">
      <div class="card"><h3>Tailored Experience</h3><p>Built specifically for players in ${group.region} with localized content and payment methods.</p></div>
      <div class="card"><h3>Proven Results</h3><p>Join thousands of satisfied users who trust ${product.name} for their ${product.category || 'gaming'} experience.</p></div>
      <div class="card"><h3>Safe & Secure</h3><p>Licensed and regulated with industry-leading security protocols to protect your account.</p></div>
    </div>
  </section>
  <section class="cta">
    <h2>Ready to Start?</h2>
    <a href="${product.url}">Play Now</a>
  </section>
</body>
</html>`
}
