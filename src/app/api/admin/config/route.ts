/**
 * GET /api/admin/config — List all admin config entries
 * PUT /api/admin/config — Update a config entry
 *
 * No auth check — admin routes are public (protected by admin page UI).
 * TODO: Add admin auth in Phase 2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'
import { invalidateConfigCache } from '@/lib/callLLM'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const db = supabaseService()
  const { data, error } = await db
    .from('admin_config')
    .select('key, value, description, updated_by, updated_at')
    .order('key')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, configs: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { key, value, updatedBy } = body

  if (!key) return NextResponse.json({ ok: false, error: 'key_required' }, { status: 400 })
  if (value === undefined) return NextResponse.json({ ok: false, error: 'value_required' }, { status: 400 })

  const db = supabaseService()
  const { data, error } = await db
    .from('admin_config')
    .upsert({
      key,
      value: typeof value === 'string' ? JSON.stringify(value) : value,
      updated_by: updatedBy || null,
    }, { onConflict: 'key' })
    .select('key, value, updated_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Invalidate the in-memory cache so next LLM call picks up the new value
  invalidateConfigCache()

  return NextResponse.json({ ok: true, config: data })
}
