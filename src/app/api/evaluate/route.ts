import { NextRequest, NextResponse } from 'next/server'
import { callLLM } from '@/lib/callLLM'

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

    const result = await callLLM({
      model: process.env.EVAL_MODEL || 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: evalPrompt }],
      caller: 'evaluate',
      action: 'asset_evaluation',
      timeoutMs: 300000,
    })

    // Try to parse JSON from response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/)
    const evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse evaluation' }

    return NextResponse.json({ evaluation })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
