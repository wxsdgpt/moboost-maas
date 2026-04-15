import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

export async function POST(req: NextRequest) {
  try {
    const { prompt, type } = await req.json()

    if (!OPENROUTER_KEY || OPENROUTER_KEY === 'your_openrouter_api_key_here') {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    const model = type === 'video'
      ? (process.env.VIDEO_MODEL || 'google/veo-3.1')
      : (process.env.IMAGE_MODEL || 'google/gemini-3-pro-image-preview')

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI MAAS',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenRouter error:', err)
      return NextResponse.json({ error: err }, { status: response.status })
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const msg = choice?.message

    let resultText = ''
    let imageData: string | null = null
    const allImages: string[] = []

    // ===== 1. Check message.images[] (Gemini 3 Pro format) =====
    // Gemini returns images in a separate "images" array on the message object:
    // { message: { content: null, images: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }] } }
    if (msg?.images && Array.isArray(msg.images)) {
      for (const img of msg.images) {
        if (img.type === 'image_url' && img.image_url?.url) {
          allImages.push(img.image_url.url)
        }
      }
    }

    // ===== 2. Check message.content (string or array) =====
    if (msg?.content) {
      const content = msg.content

      if (typeof content === 'string') {
        // Check for markdown image with base64
        const base64Match = content.match(/!\[.*?\]\(data:image\/[^;]+;base64,([^)]+)\)/)
        if (base64Match) {
          allImages.push(`data:image/png;base64,${base64Match[1]}`)
          resultText = content.replace(/!\[.*?\]\(data:image\/[^;]+;base64,[^)]+\)/, '').trim()
        } else {
          const plainBase64 = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
          if (plainBase64) {
            allImages.push(plainBase64[0])
            resultText = content.replace(plainBase64[0], '').trim()
          } else {
            resultText = content
          }
        }
      } else if (Array.isArray(content)) {
        // Multi-part response
        for (const part of content) {
          if (part.type === 'text') {
            resultText += part.text || ''
          } else if (part.type === 'image_url') {
            if (part.image_url?.url) allImages.push(part.image_url.url)
          } else if (part.inline_data || part.inlineData) {
            const inlineData = part.inline_data || part.inlineData
            allImages.push(`data:${inlineData.mime_type || inlineData.mimeType || 'image/png'};base64,${inlineData.data}`)
          }
        }
      }
    }

    // Use first image as primary
    imageData = allImages.length > 0 ? allImages[0] : null

    return NextResponse.json({
      model,
      result: resultText,
      imageData,
      allImages, // Return all images if multiple were generated
      usage: data.usage,
    })
  } catch (error: any) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
