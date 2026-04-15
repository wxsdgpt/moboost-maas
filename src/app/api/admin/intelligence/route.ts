/**
 * API: /api/admin/intelligence
 *
 * GET  — Query knowledge base, get stats, list tasks
 * POST — Trigger exploration run or quick search
 */

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import {
  runExploration,
  quickExplore,
  generateGapTasks,
  queryKnowledge,
  getKnowledgeStats,
  getRecentTasks,
  getExplorationSchedules,
  createExplorationTask,
} from '@/agents/evolution/intelligence'
import type { KnowledgeCategory } from '@/agents/evolution/intelligence'

export const runtime = 'nodejs'
export const maxDuration = 120  // 2 min for exploration runs

// ─── GET ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'stats'

  switch (view) {
    case 'stats': {
      const stats = await getKnowledgeStats()
      return NextResponse.json({ ok: true, stats })
    }

    case 'knowledge': {
      const category = searchParams.get('category') as KnowledgeCategory | null
      const vertical = searchParams.get('vertical')
      const limit = parseInt(searchParams.get('limit') || '20')
      const entries = await queryKnowledge({
        category: category || undefined,
        vertical: vertical || undefined,
        limit,
      })
      return NextResponse.json({ ok: true, entries })
    }

    case 'tasks': {
      const tasks = await getRecentTasks(30)
      return NextResponse.json({ ok: true, tasks })
    }

    case 'schedules': {
      const schedules = await getExplorationSchedules()
      return NextResponse.json({ ok: true, schedules })
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown view: ${view}` }, { status: 400 })
  }
}

// ─── POST ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const action = body.action as string

  switch (action) {
    // Full exploration run
    case 'explore': {
      const result = await runExploration(body.config || {})
      return NextResponse.json({ ok: true, result })
    }

    // Quick single-query search
    case 'quick': {
      const { query, category, vertical } = body
      if (!query) {
        return NextResponse.json({ ok: false, error: 'query is required' }, { status: 400 })
      }
      const result = await quickExplore(query, category || 'trend', vertical || null)
      return NextResponse.json({ ok: true, result })
    }

    // Create manual exploration task
    case 'create_task': {
      const { query, category, vertical, priority } = body
      if (!query || !category) {
        return NextResponse.json({ ok: false, error: 'query and category are required' }, { status: 400 })
      }
      const id = await createExplorationTask({
        query,
        category,
        vertical: vertical || null,
        priority: priority || 5,
        status: 'pending',
        collector: null,
        resultCount: 0,
        error: null,
        triggeredBy: 'manual',
        runAt: null,
      })
      return NextResponse.json({ ok: true, taskId: id })
    }

    // Generate gap analysis tasks
    case 'gap_analysis': {
      const stats = await getKnowledgeStats()
      const taskIds = await generateGapTasks(stats.byCategory)
      return NextResponse.json({ ok: true, tasksCreated: taskIds.length, taskIds })
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  }
}
