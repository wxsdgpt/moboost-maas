/**
 * Admin endpoints for collaborator-API token management.
 *
 *   GET  /api/admin/collab/tokens          — list all tokens (no plaintext)
 *   POST /api/admin/collab/tokens          — mint a new token; plaintext
 *                                            returned ONCE in the response
 *   DELETE /api/admin/collab/tokens?id=... — soft-revoke a token
 *
 * Auth: requires admin cookie (isAdminAuthenticated).
 */

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { supabaseService } from '@/lib/db'
import { generateToken } from '@/lib/collabAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function gate(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated()
  return ok ? null : NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}

export async function GET() {
  const denied = await gate()
  if (denied) return denied
  const db = supabaseService()
  const { data, error } = await db
    .from('collab_tokens')
    .select('id, name, prefix, scopes, created_at, created_by, last_used_at, revoked_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tokens: data ?? [] })
}

export async function POST(req: NextRequest) {
  const denied = await gate()
  if (denied) return denied
  const body = (await req.json().catch(() => null)) as { name?: string } | null
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })

  const tok = generateToken()
  const db = supabaseService()
  const { data, error } = await db
    .from('collab_tokens')
    .insert({
      name,
      token_hash: tok.hash,
      prefix: tok.prefix,
      created_by: 'admin',
    })
    .select('id, name, prefix, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  // Plaintext returned exactly once — never persisted.
  return NextResponse.json({ ok: true, token: data, plaintext: tok.plain })
}

export async function DELETE(req: NextRequest) {
  const denied = await gate()
  if (denied) return denied
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 })

  const db = supabaseService()
  const { error } = await db
    .from('collab_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
