import { Asset, AssetEvaluation, ModelCandidate } from '@/types'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

// ========== Image Generation (NanoBanana Pro) ==========
export async function generateImage(prompt: string, dimensions?: { width: number; height: number }) {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
      'X-Title': 'Moboost AI MAAS',
    },
    body: JSON.stringify({
      model: process.env.IMAGE_MODEL || 'google/gemini-3-pro-image-preview',
      messages: [
        {
          role: 'user',
          content: prompt,
        }
      ],
      // NanoBanana Pro specific params
      ...(dimensions && {
        extra_body: {
          image_width: dimensions.width,
          image_height: dimensions.height,
        }
      }),
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Image generation failed: ${err}`)
  }

  return response.json()
}

// ========== Video Generation (VEO3) ==========
export async function generateVideo(prompt: string) {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moboost.ai',
      'X-Title': 'Moboost AI MAAS',
    },
    body: JSON.stringify({
      model: process.env.VIDEO_MODEL || 'google/veo-3.1',
      messages: [
        {
          role: 'user',
          content: prompt,
        }
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Video generation failed: ${err}`)
  }

  return response.json()
}

// ========== Asset Evaluation Agent ==========
export async function evaluateAsset(
  assetUrl: string,
  brief: string,
  referenceUrls: string[] = []
): Promise<AssetEvaluation> {
  const evalPrompt = `You are Moboost AI's Asset Evaluation Agent. Evaluate the following generated creative asset.

## Brief that was given:
${brief}

## Asset to evaluate:
${assetUrl}

${referenceUrls.length > 0 ? `## Reference assets for comparison:\n${referenceUrls.join('\n')}` : ''}

## Evaluate on these 4 dimensions (score 0-10 each):

**D1 — 规格合规 (Spec Compliance):**
Check if dimensions, file size, format, resolution match the expected specifications.

**D2 — 内容完整性 (Content Completeness):**
Is the content comprehensive? Does it follow visual aesthetics and product usage conventions? Are all necessary elements present (CTA, brand, headline)?

**D3 — 表达力 (Expression Power):**
Is the visual hierarchy clear? Is the primary message prominent? Is it attention-grabbing for the target audience?

**D4 — 竞争优势 (Competitive Edge):**
Compared to reference assets and typical industry standards, does this feel fresh and eye-catching from a user perspective?

## Response format (JSON only):
{
  "d1_spec": { "score": X, "details": "..." },
  "d2_content": { "score": X, "details": "..." },
  "d3_expression": { "score": X, "details": "..." },
  "d4_competitive": { "score": X, "details": "..." },
  "overall": X.X,
  "suggestion": "Specific improvement suggestions..."
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
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    throw new Error('Evaluation failed')
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || '{}'
  return JSON.parse(content) as AssetEvaluation
}

// ========== Model Router (Fake for V1 — shows decision process) ==========
export function getModelCandidates(taskType: 'image' | 'video'): ModelCandidate[] {
  if (taskType === 'image') {
    return [
      {
        id: 'google/gemini-3-pro-image-preview',
        name: 'NanoBanana Pro',
        type: 'image',
        matchScore: 96,
        speed: '~8s',
        quality: 'Ultra (2K/4K)',
        cost: '$0.04/img',
      },
      {
        id: 'midjourney/v6',
        name: 'Midjourney V6',
        type: 'image',
        matchScore: 88,
        speed: '~15s',
        quality: 'High',
        cost: '$0.08/img',
      },
      {
        id: 'stability/sdxl-turbo',
        name: 'Stable Diffusion XL',
        type: 'image',
        matchScore: 72,
        speed: '~3s',
        quality: 'Medium-High',
        cost: '$0.01/img',
      },
      {
        id: 'openai/dall-e-3',
        name: 'DALL-E 3',
        type: 'image',
        matchScore: 78,
        speed: '~12s',
        quality: 'High',
        cost: '$0.06/img',
      },
    ]
  }

  return [
    {
      id: 'google/veo-3.1',
      name: 'VEO 3.1',
      type: 'video',
      matchScore: 94,
      speed: '~45s',
      quality: 'Ultra',
      cost: '$0.12/clip',
    },
    {
      id: 'openai/sora',
      name: 'Sora',
      type: 'video',
      matchScore: 89,
      speed: '~60s',
      quality: 'High',
      cost: '$0.15/clip',
    },
    {
      id: 'runway/gen3',
      name: 'Runway Gen-3',
      type: 'video',
      matchScore: 74,
      speed: '~30s',
      quality: 'Medium-High',
      cost: '$0.10/clip',
    },
  ]
}

// Fake router selection animation data
export function selectBestModel(candidates: ModelCandidate[]): ModelCandidate {
  // Always returns the first (highest score) — real routing logic in V2
  return candidates.sort((a, b) => b.matchScore - a.matchScore)[0]
}
