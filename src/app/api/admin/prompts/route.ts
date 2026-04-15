/**
 * GET /api/admin/prompts — List prompt logs with filtering
 *
 * Query params:
 *   - caller: filter by caller (e.g. 'reportGenerator')
 *   - model: filter by model
 *   - status: filter by status ('success' | 'error' | 'timeout')
 *   - limit: max results (default 50)
 *   - offset: pagination offset
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const caller = url.searchParams.get('caller')
  const model = url.searchParams.get('model')
  const status = url.searchParams.get('status')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const db = supabaseService()
  let query = db
    .from('prompt_logs')
    .select('id, user_id, project_id, caller, action, model, system_prompt, user_prompt, admin_context, response_text, input_tokens, output_tokens, total_tokens, latency_ms, cost_usd, status, error_message, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (caller) query = query.eq('caller', caller)
  if (model) query = query.eq('model', model)
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    logs: data,
    total: count,
    limit,
    offset,
  })
}
