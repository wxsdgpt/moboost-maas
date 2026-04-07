import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

export async function POST(req: NextRequest) {
  try {
    const { assetDescription, brief, referenceDescriptions } = await req.json()

    const evalPrompt = `You are Moboost AI's Asset Evaluation Agent. Score the following generated creative asset.

## Brief:
${brief}

## Generated Asset Description:
${assetDescription}

${referenceDescriptions?.length > 0 ? `## Reference Assets:\n${referenceDescriptions.join('\n')}` : ''}

## Evaluate on 4 dimensions (score 0-10 each):

D1 — Spec Compliance: dimensions, file size, format, resolution match expectations?
D2 — Content Completeness: all required elements present? follows visual & product conventions?
D3 — Expression Power: clear visual hierarchy? primary message prominent? attention-grabbing?
D4 — Competitive Edge: compared to references, does it feel fresh and eye-catching?

Respond ONLY with JSON:
{
  "d1_spec": { "score": N, "details": "..." },
  "d2_content": { "score": N, "details": "..." },
  "d3_expression": { "score": N, "details": "..." },
  "d4_competitive": { "score": N, "details": "..." },
  "overall": N.N,
  "suggestion": "..."
}`

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI MAAS',
      },
      body: JSON.stringify({
        model: process.env.EVAL_MODEL || 'anthropic/claude-sonnet-4-6',
        messages: [{ role: 'user', content: evalPrompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: response.status })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || '{}'

    // Try to parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse evaluation' }

    return NextResponse.json({ evaluation })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
