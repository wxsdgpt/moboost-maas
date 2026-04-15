/**
 * POST /api/intent
 *
 * Analyzes user input to determine intent (intel/asset/landing/pipeline/unknown).
 * Used by the homepage unified input and onboarding flow.
 *
 * Body: { input: string, context?: { productName, productUrl, vertical, explicitIntent, previousMessages } }
 * Returns: { ok: true, intent: DetectedIntent }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { detectIntent, type IntentContext } from '@/lib/intentDetector'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const user = await getOrCreateCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = await req.json()
  const { input, context = {} } = body

  if (!input?.trim()) {
    return NextResponse.json({ ok: false, error: 'input_required' }, { status: 400 })
  }

  try {
    const intentContext: IntentContext = {
      ...context,
      userId: user.id,
    }

    const result = await detectIntent(input.trim(), intentContext)
    return NextResponse.json({ ok: true, intent: result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
