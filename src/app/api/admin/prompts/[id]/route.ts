/**
 * GET /api/admin/prompts/[id] — Get full prompt log detail including full_messages and response_json
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const db = supabaseService()
  const { data, error } = await db
    .from('prompt_logs')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  return NextResponse.json({ ok: true, log: data })
}
