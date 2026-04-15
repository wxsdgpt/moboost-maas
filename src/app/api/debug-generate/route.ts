import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 300_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Debug endpoint — returns raw OpenRouter response for inspection
export async function POST(req: NextRequest) {
  try {
    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }
    const { prompt } = body

    const response = await fetchWithTimeout(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI MAAS Debug',
      },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || 'google/gemini-3-pro-image-preview',
        messages: [
          { role: 'user', content: prompt || 'Generate a simple sports betting banner ad with dark background and green CTA button' },
        ],
      }),
    })

    const rawText = await response.text()

    // Try to parse as JSON
    let parsed = null
    try {
      parsed = JSON.parse(rawText)
    } catch {
      // not json
    }

    return NextResponse.json({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      rawText: rawText.slice(0, 5000), // Truncate for safety
      parsed,
      // Analyze content structure
      contentType: parsed?.choices?.[0]?.message?.content
        ? typeof parsed.choices[0].message.content === 'string'
          ? 'string'
          : Array.isArray(parsed.choices[0].message.content)
            ? 'array'
            : typeof parsed.choices[0].message.content
        : 'missing',
      contentLength: parsed?.choices?.[0]?.message?.content
        ? typeof parsed.choices[0].message.content === 'string'
          ? parsed.choices[0].message.content.length
          : JSON.stringify(parsed.choices[0].message.content).length
        : 0,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
