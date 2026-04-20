/**
 * Bearer-token auth for the /api/v1/collab/* endpoints.
 *
 * Tokens are minted from the admin UI (/admin/collab). Plaintext is
 * shown once; only sha256(token) is persisted in collab_tokens.
 *
 * Wire format:
 *     Authorization: Bearer <plaintext-token>
 *
 * verifyCollabRequest returns the active token row on success, or null.
 * Updates last_used_at as a side effect (best-effort, fire-and-forget).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseService } from './db'

export type CollabToken = {
  id: string
  name: string
  prefix: string
  scopes: unknown
  created_at: string
  created_by: string | null
  last_used_at: string | null
  revoked_at: string | null
}

export function hashToken(plain: string): string {
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex')
}

export function generateToken(): { plain: string; hash: string; prefix: string } {
  // 32 bytes → 43-char base64url; prefix `mb_` for visual recognition
  const raw = 'mb_' + crypto.randomBytes(32).toString('base64url')
  return { plain: raw, hash: hashToken(raw), prefix: raw.slice(0, 8) }
}

function extractBearer(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

export async function verifyCollabRequest(req: Request): Promise<CollabToken | null> {
  const plain = extractBearer(req)
  if (!plain) return null
  const hash = hashToken(plain)
  const sb = supabaseService()
  const { data, error } = await sb
    .from('collab_tokens')
    .select('id, name, prefix, scopes, created_at, created_by, last_used_at, revoked_at')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .maybeSingle()
  if (error || !data) return null
  // best-effort touch
  sb.from('collab_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {}, () => {})
  return data as CollabToken
}

/** Convenience wrapper for route handlers. Returns the token or a 401 Response. */
export async function requireCollabToken(req: Request): Promise<CollabToken | NextResponse> {
  const tok = await verifyCollabRequest(req)
  if (!tok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="moboost-collab"' } },
    )
  }
  return tok
}
