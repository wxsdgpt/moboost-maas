import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

// Debug endpoint — returns raw OpenRouter response for inspection
export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
