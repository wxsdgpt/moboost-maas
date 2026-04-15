import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 300_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Debug endpoint to test different video generation API formats
export async function POST(req: NextRequest) {
  try {
    // Validate body parsing
    try {
      await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: 'request_error' }, { status: 400 })
  }

  const results: Record<string, any> = {}

  // Test 1: /api/alpha/videos (original guess)
  try {
    const res1 = await fetchWithTimeout('https://openrouter.ai/api/alpha/videos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/veo-3.1',
        prompt: 'A simple green banner slowly rotating',
      }),
    })
    results.alpha_videos = {
      status: res1.status,
      body: await res1.text().then(t => t.slice(0, 1000)),
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    results.alpha_videos = { error: message }
  }

  // Test 2: /api/v1/generations (SDK style)
  try {
    const res2 = await fetchWithTimeout('https://openrouter.ai/api/v1/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/veo-3.1',
        prompt: 'A simple green banner slowly rotating',
        type: 'video',
      }),
    })
    results.v1_generations = {
      status: res2.status,
      body: await res2.text().then(t => t.slice(0, 1000)),
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    results.v1_generations = { error: message }
  }

  // Test 3: /api/v1/video/generations
  try {
    const res3 = await fetchWithTimeout('https://openrouter.ai/api/v1/video/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/veo-3.1',
        prompt: 'A simple green banner slowly rotating',
      }),
    })
    results.v1_video_generations = {
      status: res3.status,
      body: await res3.text().then(t => t.slice(0, 1000)),
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    results.v1_video_generations = { error: message }
  }

  // Test 4: standard chat completions with veo-3.1
  try {
    const res4 = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
      },
      body: JSON.stringify({
        model: 'google/veo-3.1',
        messages: [{ role: 'user', content: 'Generate a 5 second video of a green banner rotating' }],
      }),
    })
    results.chat_completions = {
      status: res4.status,
      body: await res4.text().then(t => t.slice(0, 1000)),
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    results.chat_completions = { error: message }
  }

  return NextResponse.json(results)
}

