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
      const response = await fetch(`https://openrouter.ai/api/alpha/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://moboost.ai',
          'X-Title': 'Moboost AI MAAS',
        },
        body: JSON.stringify({
          model: process.env.VIDEO_MODEL || 'google/veo-3.1',
          prompt,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        console.error('VEO3 submit error:', err)
        return NextResponse.json({ error: err }, { status: response.status })
      }

      const data = await response.json()
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
