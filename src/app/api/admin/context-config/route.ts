/**
 * GET  /api/admin/context-config — Read current context config
 * PUT  /api/admin/context-config — Update context config (runtime override)
 * DELETE /api/admin/context-config — Reset to defaults
 *
 * Manages contextBuilder parameters (maxContextMessages, maxContextChars, etc.)
 * Config is stored in-memory (runtime override) — resets on server restart.
 * For persistent config, use admin_config table entries with key prefix 'context_'.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getContextConfig,
  setContextConfig,
  resetContextConfig,
  CONTEXT_DEFAULTS,
  type ContextConfig,
} from '@/lib/contextConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: getContextConfig(),
    defaults: CONTEXT_DEFAULTS,
  })
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as Partial<ContextConfig>

    // Validate
    if (body.maxContextMessages !== undefined && (typeof body.maxContextMessages !== 'number' || body.maxContextMessages < 0)) {
      return NextResponse.json({ ok: false, error: 'maxContextMessages must be a non-negative number' }, { status: 400 })
    }
    if (body.maxContextChars !== undefined && (typeof body.maxContextChars !== 'number' || body.maxContextChars < 100)) {
      return NextResponse.json({ ok: false, error: 'maxContextChars must be >= 100' }, { status: 400 })
    }

    setContextConfig(body)
    return NextResponse.json({ ok: true, config: getContextConfig() })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE() {
  resetContextConfig()
  return NextResponse.json({ ok: true, config: getContextConfig(), message: 'Reset to defaults' })
}
