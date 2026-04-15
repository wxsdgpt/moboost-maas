/**
 * POST /api/admin/reset
 *
 * Wipes ALL data across ALL users — no auth required.
 * This is a test/dev utility endpoint.
 *
 * Clears:
 *   1. Clerk: delete all Clerk user accounts (so they can't auto-login)
 *   2. Supabase: all table rows (event_log, landing_pages, credit_ledger,
 *      reports, products, subscriptions, market_intel, users)
 *   3. File system: ALL user project files + expert-search cache
 *
 * Accepts body:
 *   { scope: 'all' | 'supabase' | 'files' | 'clerk' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { supabaseService } from '@/lib/db'
import { promises as fs } from 'fs'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

export async function POST(req: NextRequest) {
  try {
    const { scope = 'all' } = await req.json().catch(() => ({ scope: 'all' }))

    const results: Record<string, string> = {}

    // ── 1. Clerk: delete all user accounts ──
    if (scope === 'all' || scope === 'clerk') {
      try {
        const clerk = await clerkClient()
        // Fetch all users (paginated, max 500 per request)
        let deletedCount = 0
        let offset = 0
        const limit = 100

        while (true) {
          const userList = await clerk.users.getUserList({ limit, offset })
          const users = userList.data || []
          if (users.length === 0) break

          for (const u of users) {
            try {
              await clerk.users.deleteUser(u.id)
              deletedCount++
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e)
              console.error(`[admin/reset] failed to delete Clerk user ${u.id}:`, message)
            }
          }

          offset += limit
          // Safety: if we got fewer than limit, we're done
          if (users.length < limit) break
        }

        results.clerk_users = `deleted ${deletedCount} accounts`
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        results.clerk_users = `error: ${message}`
      }
    }

    // ── 2. Supabase cleanup — TRUNCATE all tables via SQL function ──
    if (scope === 'all' || scope === 'supabase') {
      const db = supabaseService()

      // Use the admin_truncate_all_tables() SQL function which runs as
      // security definer (DB owner), bypassing RLS completely.
      const rpcResult = await db.rpc('admin_truncate_all_tables')

      if (rpcResult.error) {
        results.supabase = `rpc error: ${rpcResult.error.message}`

        // Fallback: try individual table deletes (order matters — child tables first)
        const tables = [
          'prompt_logs', 'project_conversations', 'project_assets',
          'event_log', 'agent_execution_logs', 'landing_pages',
          'credit_ledger', 'reports', 'projects', 'products',
          'subscriptions', 'market_intel', 'users',
        ]
        for (const table of tables) {
          const r = await db.from(table).delete().not('id', 'is', null)
          results[table] = r.error ? `error: ${r.error.message}` : 'cleared (fallback)'
        }
      } else {
        // Verify
        const check = await db.from('users').select('id', { count: 'exact', head: true })
        const remaining = check.count ?? 0
        results.supabase = remaining === 0
          ? 'all tables truncated'
          : `truncate reported success but ${remaining} users remain`
      }
    }

    // ── 3. File system cleanup ──
    if (scope === 'all' || scope === 'files') {
      // Entire users directory
      const usersDir = path.join(DATA_DIR, 'users')
      try {
        await fs.rm(usersDir, { recursive: true, force: true })
        results.project_files = 'cleared'
      } catch {
        results.project_files = 'not found or already clean'
      }

      // Expert search cache
      const searchDir = path.join(DATA_DIR, 'expert-search')
      try {
        await fs.rm(searchDir, { recursive: true, force: true })
        results.expert_search_cache = 'cleared'
      } catch {
        results.expert_search_cache = 'not found or already clean'
      }
    }

    const response = NextResponse.json({
      success: true,
      message: `全部数据已清除 (scope: ${scope})`,
      results,
    })

    // Clear the onboarding cookie so middleware re-checks on next page load
    if (scope === 'all' || scope === 'supabase' || scope === 'clerk') {
      response.cookies.set('moboost:onboarded', '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
      })
    }

    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[admin/reset] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
