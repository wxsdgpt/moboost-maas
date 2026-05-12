/**
 * GET  /api/debug/op-log — Read operation logs (AI + developer debugging)
 * POST /api/debug/op-log — Receive client-side operation logs
 *
 * Client-side components (UnifiedCollector, ProjectWorkspace) periodically
 * flush their sessionStorage logs here so the AI agent can read them
 * server-side without needing browser access.
 *
 * Logs are stored in <DATA_DIR>/op-logs/<source>.jsonl (append-only).
 * GET returns the last N entries per source.
 */
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const LOG_DIR = join(DATA_DIR, 'op-logs')

// ── POST: receive client logs ──

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { source, entries } = body

    if (!source || typeof source !== 'string') {
      return NextResponse.json({ ok: false, error: 'source_required' }, { status: 400 })
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ ok: false, error: 'entries_required' }, { status: 400 })
    }

    // Sanitize source name (prevent path traversal)
    const safeName = source.replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeName) {
      return NextResponse.json({ ok: false, error: 'invalid_source' }, { status: 400 })
    }

    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })

    const file = join(LOG_DIR, `${safeName}.jsonl`)
    const lines = entries
      .slice(0, 100) // Max 100 entries per flush
      .map((e: unknown) => JSON.stringify(e))
      .join('\n') + '\n'

    writeFileSync(file, lines, { flag: 'a' })

    return NextResponse.json({ ok: true, written: entries.length })
  } catch (err) {
    console.error('[api/debug/op-log] POST error:', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}

// ── GET: read logs (for AI agent / developer) ──

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const source = url.searchParams.get('source') // optional filter
    const limitStr = url.searchParams.get('limit')
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 100, 500) : 100

    if (!existsSync(LOG_DIR)) {
      return NextResponse.json({ ok: true, logs: {}, message: 'No logs yet' })
    }

    const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.jsonl'))
    const logs: Record<string, unknown[]> = {}

    for (const f of files) {
      const name = f.replace('.jsonl', '')
      if (source && name !== source) continue

      const content = readFileSync(join(LOG_DIR, f), 'utf-8')
      const allLines = content.trim().split('\n').filter(Boolean)
      // Return last N entries (most recent)
      const recentLines = allLines.slice(-limit)
      logs[name] = recentLines.map(line => {
        try { return JSON.parse(line) }
        catch { return { raw: line } }
      })
    }

    return NextResponse.json({ ok: true, logs })
  } catch (err) {
    console.error('[api/debug/op-log] GET error:', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
