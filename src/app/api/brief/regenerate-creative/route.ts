/**
 * POST /api/brief/regenerate-creative
 *
 * Regenerate an image or video creative tied to a report, using a
 * user-supplied prompt. Persists the new asset alongside any prior
 * creatives for that report (we never delete history — re-runs stack
 * reverse-chronologically in the report-detail view).
 *
 * Body: { reportId, type: 'image'|'video', prompt, audienceTag?, region? }
 *
 * Auth: must own the report. Reuses the same OpenRouter call patterns as
 * /api/generate (image) and /api/generate-video (video, async polling).
 * For video this means the request can take 1-3 minutes to return — the
 * client should show a loading state.
 *
 * Why this exists separately from /api/generate: that route is a stateless
 * model proxy with no auth/persistence. Regen needs ownership checks +
 * persistence + report linking. Keeping the model-proxy route stateless
 * avoids forcing every caller to deal with project semantics.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import { ensureStableUrl } from '@/lib/supabaseStorage'
import { notifyCollab } from '@/lib/collabWebhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'google/gemini-3-pro-image-preview'
const VIDEO_MODEL = process.env.VIDEO_MODEL || 'google/veo-3.1'

type Body = {
  reportId?: unknown
  type?: unknown
  prompt?: unknown
  audienceTag?: unknown
  region?: unknown
}

function s(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  if (!OPENROUTER_KEY) return NextResponse.json({ ok: false, error: 'no_api_key' }, { status: 500 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })

  const reportId = s(body.reportId)
  const type = s(body.type)
  const prompt = s(body.prompt)
  if (!reportId || !type || !prompt) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }
  if (type !== 'image' && type !== 'video') {
    return NextResponse.json({ ok: false, error: 'invalid_type' }, { status: 400 })
  }

  const db = supabaseService()
  const { data: report, error: reportErr } = await db
    .from('reports')
    .select('id, project_id')
    .eq('id', reportId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (reportErr || !report) {
    return NextResponse.json({ ok: false, error: 'report_not_found' }, { status: 404 })
  }
  if (!report.project_id) {
    return NextResponse.json({ ok: false, error: 'report_has_no_project' }, { status: 409 })
  }

  let url: string | null = null
  const model = type === 'image' ? IMAGE_MODEL : VIDEO_MODEL

  try {
    if (type === 'image') {
      url = await generateImage(prompt)
    } else {
      url = await generateVideo(prompt)
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'generation_failed', detail: (err as Error).message },
      { status: 502 },
    )
  }

  if (!url) {
    return NextResponse.json({ ok: false, error: 'no_output' }, { status: 502 })
  }

  const { data: asset, error: insertErr } = await db
    .from('project_assets')
    .insert({
      project_id: report.project_id,
      report_id: report.id,
      user_id: user.id,
      type,
      url,
      prompt,
      model,
      audience_tag: s(body.audienceTag),
      region: s(body.region),
      status: 'done',
    })
    .select('id, type, url, thumbnail, prompt, model, audience_tag, region, created_at')
    .single()

  if (insertErr) {
    return NextResponse.json(
      { ok: false, error: 'db_error', detail: insertErr.message },
      { status: 500 },
    )
  }

  const stableUrl = await ensureStableUrl(asset.id)
  if (stableUrl) asset.url = stableUrl

  notifyCollab('asset.regenerated', {
    assetId: asset.id,
    reportId: report.id,
    projectId: report.project_id,
    type: asset.type,
    url: asset.url,
    audienceTag: asset.audience_tag,
    region: asset.region,
    createdAt: asset.created_at,
  }).catch(() => {})

  return NextResponse.json({ ok: true, asset })
}

/* ─────────── Image (single round-trip) ─────────── */

async function generateImage(prompt: string): Promise<string | null> {
  const res = await fetchWithTimeout(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
      'X-Title': 'Moboost AI MAAS',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 180_000)

  if (!res.ok) throw new Error(`image_api_${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const msg = data.choices?.[0]?.message
  if (msg?.images && Array.isArray(msg.images)) {
    for (const img of msg.images) {
      if (img.type === 'image_url' && img.image_url?.url) return img.image_url.url
    }
  }
  if (typeof msg?.content === 'string') {
    const m = msg.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
    if (m) return m[0]
  }
  return null
}

/* ─────────── Video (submit → poll → download) ─────────── */

async function generateVideo(prompt: string): Promise<string | null> {
  // Submit
  const submit = await fetchWithTimeout(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
      'X-Title': 'Moboost AI MAAS',
    },
    body: JSON.stringify({
      model: VIDEO_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 60_000)
  if (!submit.ok) throw new Error(`video_submit_${submit.status}`)
  const submitData = await submit.json()

  // Best-effort: scan for a video URL in the response. Different models
  // surface this differently; we accept anything that looks like a URL
  // pointing at .mp4/.webm or a data: URI.
  const url = extractMediaUrl(submitData)
  if (url) return url
  throw new Error('video_no_url_in_response')
}

function extractMediaUrl(obj: unknown): string | null {
  if (!obj) return null
  const seen = new WeakSet<object>()
  function walk(v: unknown): string | null {
    if (typeof v === 'string') {
      if (/^data:video\//.test(v)) return v
      if (/^https?:\/\/.*\.(mp4|webm|mov)(\?|$)/i.test(v)) return v
      return null
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        const found = walk(item)
        if (found) return found
      }
      return null
    }
    if (v && typeof v === 'object') {
      if (seen.has(v as object)) return null
      seen.add(v as object)
      for (const key of Object.keys(v as Record<string, unknown>)) {
        const found = walk((v as Record<string, unknown>)[key])
        if (found) return found
      }
    }
    return null
  }
  return walk(obj)
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}
