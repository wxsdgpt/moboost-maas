'use client'

/**
 * /admin/collab — Collaborator API token management.
 *
 * - Lists tokens (id, name, prefix, created/last-used/revoked timestamps).
 * - "Generate" creates a new token; the plaintext is displayed exactly
 *   once (with a copy-to-clipboard button) and never persisted server-side.
 * - "Revoke" soft-deletes by setting revoked_at. A revoked token row is
 *   kept for audit but the token can no longer authenticate.
 */

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, Copy, Check, Trash2, Key } from 'lucide-react'

type TokenRow = {
  id: string
  name: string
  prefix: string
  scopes: unknown
  created_at: string
  created_by: string | null
  last_used_at: string | null
  revoked_at: string | null
}

export default function AdminCollabPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [reveal, setReveal] = useState<{ id: string; plaintext: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/collab/tokens', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'fetch_failed')
      setTokens(json.tokens || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function create() {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/collab/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'create_failed')
      setReveal({ id: json.token.id, plaintext: json.plaintext })
      setName('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? It will stop working immediately.')) return
    try {
      const res = await fetch(`/api/admin/collab/tokens?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'revoke_failed')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function copyPlaintext() {
    if (!reveal) return
    await navigator.clipboard.writeText(reveal.plaintext)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: '24px 32px', color: 'var(--text-1)', background: 'var(--bg)', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Key size={24} /> Collaborator API Tokens
      </h1>
      <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 24, maxWidth: 760 }}>
        Bearer tokens for the <code style={{ background: 'var(--border)', padding: '2px 6px', borderRadius: 4 }}>/api/v1/collab/*</code> endpoints.
        Plaintext is shown once at creation — store it somewhere safe immediately. Revoking is instant.
      </p>

      {/* Reveal panel */}
      {reveal && (
        <div style={{
          background: '#1a2e1a', border: '1px solid #2d5a2d', borderRadius: 8,
          padding: 16, marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, color: '#aef0ae', marginBottom: 8 }}>
            Token created. Copy it now — you won&apos;t see it again.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{
              flex: 1, background: '#0a1a0a', padding: '10px 12px', borderRadius: 4,
              fontSize: 13, color: 'var(--text-1)', overflow: 'auto', whiteSpace: 'nowrap',
            }}>
              {reveal.plaintext}
            </code>
            <button
              onClick={copyPlaintext}
              style={{
                background: copied ? '#2d5a2d' : 'var(--brand)', color: 'var(--bg)', border: 'none',
                padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => setReveal(null)}
              style={{ background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, maxWidth: 600 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. Acme Loc Team)"
          onKeyDown={(e) => { if (e.key === 'Enter') create() }}
          style={{
            flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)',
            color: 'var(--text-1)', padding: '10px 12px', borderRadius: 6, fontSize: 14,
          }}
        />
        <button
          onClick={create}
          disabled={creating || !name.trim()}
          style={{
            background: 'var(--brand)', color: 'var(--bg)', border: 'none',
            padding: '10px 18px', borderRadius: 6, cursor: creating ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
            opacity: !name.trim() ? 0.5 : 1,
          }}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Generate
        </button>
      </div>

      {error && (
        <div style={{ color: '#ff6b6b', marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      {/* Tokens table */}
      {loading ? (
        <div style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--border)' }}>
              <tr>
                {['Name', 'Prefix', 'Created', 'Last used', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9c9c9f' }}>No tokens yet.</td></tr>
              ) : tokens.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>{t.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#9c9c9f' }}>{t.prefix}…</td>
                  <td style={{ padding: '10px 12px', color: '#9c9c9f' }}>{new Date(t.created_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', color: '#9c9c9f' }}>
                    {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {t.revoked_at ? (
                      <span style={{ color: '#ff6b6b' }}>revoked</span>
                    ) : (
                      <span style={{ color: '#7dd87d' }}>active</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {!t.revoked_at && (
                      <button
                        onClick={() => revoke(t.id)}
                        title="Revoke"
                        style={{
                          background: 'transparent', color: '#ff6b6b', border: '1px solid rgba(255,59,48,0.2)',
                          padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
                        }}
                      >
                        <Trash2 size={12} /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
