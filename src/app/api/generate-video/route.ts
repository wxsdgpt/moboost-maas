import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 300_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * Safely parse a response as JSON.
 * If the response is HTML or non-JSON, returns a descriptive error instead of
 * crashing with "Unexpected token '<'".
 */
async function safeParseJson(response: Response, label: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const ct = response.headers.get('content-type') || ''
  const text = await response.text()

  // HTML response — OpenRouter returned an error/maintenance page
  if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html') || ct.includes('text/html')) {
    console.error(`[generate-video] ${label}: received HTML instead of JSON (status ${response.status})`)
    console.error(`[generate-video] ${label}: first 200 chars:`, text.slice(0, 200))
    return {
      ok: false,
      error: `OpenRouter returned an HTML page instead of JSON (HTTP ${response.status}). The video API may be temporarily unavailable or the API key may be invalid.`,
    }
  }

  // Try to parse as JSON
  try {
    const data = JSON.parse(text)
    return { ok: true, data }
  } catch {
    console.error(`[generate-video] ${label}: JSON parse failed (status ${response.status})`)
    console.error(`[generate-video] ${label}: body:`, text.slice(0, 500))
    return {
      ok: false,
      error: `OpenRouter returned invalid JSON (HTTP ${response.status}): ${text.slice(0, 100)}`,
    }
  }
}

// VEO3 uses OpenRouter's async video generation API
// POST /api/v1/videos → returns job_id (migrated from /api/alpha/videos)
// GET  /api/v1/videos/{job_id} → poll status
// GET  /api/v1/videos/{job_id}/content?index=0 → download video

export async function POST(req: NextRequest) {
  try {
    const { prompt, action, jobId } = await req.json()

    if (!OPENROUTER_KEY) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    // ===== Action: submit — Start a new video generation job =====
    if (action === 'submit') {
      const wantAudio = process.env.VIDEO_GENERATE_AUDIO !== 'false'

      // VEO 3.1 via OpenRouter: `generate_audio: true` at top level enables
      // native audio. Audio is enabled by default for veo-3.1; explicitly
      // setting it makes intent clear and protects against future defaults.
      interface RequestBody {
        model: string
        prompt: string
        generate_audio?: boolean
      }

      const requestBody: RequestBody = {
        model: process.env.VIDEO_MODEL || 'google/veo-3.1',
        prompt,
        generate_audio: wantAudio,
      }

      console.log('[generate-video] submit → openrouter', { model: requestBody.model, audio: wantAudio })

      const response = await fetchWithTimeout(`https://openrouter.ai/api/v1/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://moboost.ai',
          'X-Title': 'Moboost AI MAAS',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const parsed = await safeParseJson(response, 'submit-error')
        const errMsg = !parsed.ok ? parsed.error : (parsed.data.error as string) || `HTTP ${response.status}`
        console.error('[generate-video] submit ← openrouter ERROR', response.status, errMsg)
        return NextResponse.json({ error: errMsg }, { status: response.status })
      }

      const parsed = await safeParseJson(response, 'submit')
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 502 })
      }

      const data = parsed.data
      console.log('[generate-video] submit ← jobId:', data.id || data.job_id)

      return NextResponse.json({
        jobId: data.id || data.job_id,
        status: 'submitted',
        raw: data,
      })
    }

    // ===== Action: poll — Check job status =====
    if (action === 'poll' && jobId) {
      const response = await fetchWithTimeout(`https://openrouter.ai/api/v1/videos/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
        },
      })

      if (!response.ok) {
        const parsed = await safeParseJson(response, 'poll-error')
        const errMsg = !parsed.ok ? parsed.error : (parsed.data.error as string) || `HTTP ${response.status}`
        return NextResponse.json({ error: errMsg }, { status: response.status })
      }

      const parsed = await safeParseJson(response, 'poll')
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 502 })
      }

      const data = parsed.data
      return NextResponse.json({
        jobId,
        status: data.status,
        progress: data.progress,
        raw: data,
      })
    }

    // ===== Action: download — Get the video content URL =====
    if (action === 'download' && jobId) {
      const response = await fetchWithTimeout(`https://openrouter.ai/api/v1/videos/${jobId}/content?index=0`, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
        },
      })

      if (!response.ok) {
        const errText = await response.text()
        return NextResponse.json({
          error: `Download failed (HTTP ${response.status}): ${errText.slice(0, 200)}`,
        }, { status: response.status })
      }

      // This might return the video as binary or a redirect URL
      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('video') || contentType.includes('octet-stream')) {
        // Convert to base64 data URL
        const buffer = await response.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const mimeType = contentType.includes('mp4') ? 'video/mp4' : 'video/webm'
        return NextResponse.json({
          jobId,
          status: 'completed',
          videoData: `data:${mimeType};base64,${base64}`,
        })
      }

      // Maybe it returns JSON with a URL
      const parsed = await safeParseJson(response, 'download')
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 502 })
      }

      const data = parsed.data
      return NextResponse.json({
        jobId,
        status: 'completed',
        videoUrl: data.url || data.video_url,
        raw: data,
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use submit/poll/download' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[generate-video] unhandled error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
