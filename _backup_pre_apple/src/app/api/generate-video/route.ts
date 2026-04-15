import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

// VEO3 uses OpenRouter's async video generation API
// POST /api/alpha/videos → returns job_id
// GET  /api/alpha/videos/{job_id} → poll status
// GET  /api/alpha/videos/{job_id}/content?index=0 → download video

export async function POST(req: NextRequest) {
  try {
    const { prompt, action, jobId } = await req.json()

    if (!OPENROUTER_KEY) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    const baseUrl = OPENROUTER_BASE.replace('/v1', '').replace('/api/v1', '')
    // baseUrl should be https://openrouter.ai or similar

    // ===== Action: submit — Start a new video generation job =====
    if (action === 'submit') {
      // ⚠ Veo 3.1 audio toggle — round 3 (2026-04-08, locked via WebSearch)
      // ────────────────────────────────────────────────────────────────────
      // Round 1 (camelCase generateAudio only): silent output. Round 2
      // (shotgun across 6 wrappers): pending. Round 3 (this one) narrows
      // to the verified shape after WebSearch confirmed OpenRouter's
      // alpha-video body parameter list is:
      //   prompt, aspect_ratio, duration, generate_audio, resolution
      // → top-level snake_case `generate_audio: true` is the canonical key.
      //
      // Veo 3.x natively generates synchronized audio (dialogue + ambient
      // + music) but it is OFF BY DEFAULT in the alpha API.
      //
      // We also keep a Vertex-AI `parameters.generateAudio` mirror because
      // OpenRouter's parser may forward unknown fields straight through to
      // Vertex on the back end — cheap belt-and-suspenders, no downside.
      //
      // Opt-out: VIDEO_GENERATE_AUDIO=false → both flags omitted.
      const wantAudio = process.env.VIDEO_GENERATE_AUDIO !== 'false'

      const requestBody: any = {
        model: process.env.VIDEO_MODEL || 'google/veo-3.1',
        prompt,
      }
      if (wantAudio) {
        requestBody.generate_audio = true   // ← OpenRouter alpha canonical
        requestBody.parameters = {          // ← Vertex AI fallback mirror
          generateAudio: true,
        }
      }

      console.log('[generate-video] submit → openrouter, body:', JSON.stringify(requestBody))

      const response = await fetch(`https://openrouter.ai/api/alpha/videos`, {
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
        const err = await response.text()
        console.error('[generate-video] submit ← openrouter ERROR', response.status, err)
        return NextResponse.json({ error: err }, { status: response.status })
      }

      const data = await response.json()
      // Log the full echoed response so xu can see which audio flag the
      // upstream actually accepted (or whether all of them were dropped).
      console.log('[generate-video] submit ← openrouter OK, raw:', JSON.stringify(data))

      return NextResponse.json({
        jobId: data.id || data.job_id,
        status: 'submitted',
        raw: data,
      })
    }

    // ===== Action: poll — Check job status =====
    if (action === 'poll' && jobId) {
      const response = await fetch(`https://openrouter.ai/api/alpha/videos/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
        },
      })

      if (!response.ok) {
        const err = await response.text()
        return NextResponse.json({ error: err }, { status: response.status })
      }

      const data = await response.json()
      return NextResponse.json({
        jobId,
        status: data.status, // unknown → pending → completed / failed
        progress: data.progress,
        raw: data,
      })
    }

    // ===== Action: download — Get the video content URL =====
    if (action === 'download' && jobId) {
      const response = await fetch(`https://openrouter.ai/api/alpha/videos/${jobId}/content?index=0`, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
        },
      })

      if (!response.ok) {
        const err = await response.text()
        return NextResponse.json({ error: err }, { status: response.status })
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
      const data = await response.json()
      return NextResponse.json({
        jobId,
        status: 'completed',
        videoUrl: data.url || data.video_url,
        raw: data,
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use submit/poll/download' }, { status: 400 })
  } catch (error: any) {
    console.error('Video generate error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
