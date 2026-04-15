/**
 * Intelligence Store — Supabase CRUD for industry_knowledge
 * ===========================================================
 *
 * All reads and writes to the knowledge base go through here.
 * Handles dedup, freshness decay, and supersession.
 */

import { supabaseService } from '@/lib/db'
import type {
  KnowledgeEntry,
  KnowledgeCategory,
  ExplorationTask,
  ExplorationSchedule,
} from './types'

// ─── Knowledge Entry CRUD ────────────────────────────────────────

/**
 * Save a knowledge entry. Deduplicates by title + category + vertical.
 * If a duplicate exists, supersedes the old entry.
 */
export async function saveKnowledge(entry: KnowledgeEntry): Promise<string> {
  const db = supabaseService()

  // Check for existing similar entry
  const { data: existing } = await db
    .from('industry_knowledge')
    .select('id')
    .eq('title', entry.title)
    .eq('category', entry.category)
    .eq('status', 'active')
    .limit(1)

  // If duplicate exists, supersede it
  if (existing && existing.length > 0) {
    const oldId = existing[0].id as string
    await db
      .from('industry_knowledge')
      .update({ status: 'superseded', superseded_by: null })
      .eq('id', oldId)

    const { data, error } = await db
      .from('industry_knowledge')
      .insert({
        category: entry.category,
        vertical: entry.vertical,
        region: entry.region,
        tags: entry.tags,
        title: entry.title,
        summary: entry.summary,
        full_content: entry.fullContent,
        structured: entry.structured,
        source_type: entry.sourceType,
        source_url: entry.sourceUrl,
        source_query: entry.sourceQuery,
        confidence: entry.confidence,
        relevance: entry.relevance,
        freshness: entry.freshness,
        status: 'active',
        superseded_by: null,
        expires_at: entry.expiresAt,
        collected_by: entry.collectedBy,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to save knowledge: ${error.message}`)

    // Link old → new
    await db
      .from('industry_knowledge')
      .update({ superseded_by: (data as { id: string }).id })
      .eq('id', oldId)

    return (data as { id: string }).id
  }

  // New entry
  const { data, error } = await db
    .from('industry_knowledge')
    .insert({
      category: entry.category,
      vertical: entry.vertical,
      region: entry.region,
      tags: entry.tags,
      title: entry.title,
      summary: entry.summary,
      full_content: entry.fullContent,
      structured: entry.structured,
      source_type: entry.sourceType,
      source_url: entry.sourceUrl,
      source_query: entry.sourceQuery,
      confidence: entry.confidence,
      relevance: entry.relevance,
      freshness: entry.freshness,
      status: 'active',
      expires_at: entry.expiresAt,
      collected_by: entry.collectedBy,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to save knowledge: ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Batch save multiple knowledge entries.
 */
export async function saveKnowledgeBatch(entries: KnowledgeEntry[]): Promise<string[]> {
  const ids: string[] = []
  for (const entry of entries) {
    try {
      const id = await saveKnowledge(entry)
      ids.push(id)
    } catch (err) {
      // Failed to save knowledge entry
    }
  }
  return ids
}

/**
 * Query knowledge entries with filters.
 */
export async function queryKnowledge(filters: {
  category?: KnowledgeCategory
  vertical?: string
  tags?: string[]
  status?: string
  minRelevance?: number
  minConfidence?: number
  limit?: number
  offset?: number
}): Promise<KnowledgeEntry[]> {
  const db = supabaseService()
  let query = db
    .from('industry_knowledge')
    .select('*')
    .order('collected_at', { ascending: false })

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.vertical) query = query.eq('vertical', filters.vertical)
  if (filters.status) query = query.eq('status', filters.status)
  else query = query.eq('status', 'active')
  if (filters.minRelevance) query = query.gte('relevance', filters.minRelevance)
  if (filters.minConfidence) query = query.gte('confidence', filters.minConfidence)
  if (filters.tags && filters.tags.length > 0) query = query.overlaps('tags', filters.tags)
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)

  const { data, error } = await query
  if (error) {
    return []
  }

  return (data || []).map(rowToEntry)
}

/**
 * Get knowledge stats for the admin dashboard.
 */
export async function getKnowledgeStats(): Promise<{
  total: number
  byCategory: Record<string, number>
  bySource: Record<string, number>
  avgRelevance: number
  avgConfidence: number
  recentCount: number  // last 24h
}> {
  const db = supabaseService()

  const { data: all, error } = await db
    .from('industry_knowledge')
    .select('category, source_type, relevance, confidence, collected_at')
    .eq('status', 'active')

  if (error || !all) {
    return {
      total: 0,
      byCategory: {},
      bySource: {},
      avgRelevance: 0,
      avgConfidence: 0,
      recentCount: 0,
    }
  }

  const now = Date.now()
  const dayAgo = now - 24 * 60 * 60 * 1000

  const byCategory: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  let totalRelevance = 0
  let totalConfidence = 0
  let recentCount = 0

  for (const row of all) {
    const cat = row.category as string
    const src = row.source_type as string
    byCategory[cat] = (byCategory[cat] || 0) + 1
    bySource[src] = (bySource[src] || 0) + 1
    totalRelevance += (row.relevance as number) || 0
    totalConfidence += (row.confidence as number) || 0
    if (new Date(row.collected_at as string).getTime() > dayAgo) recentCount++
  }

  return {
    total: all.length,
    byCategory,
    bySource,
    avgRelevance: all.length > 0 ? totalRelevance / all.length : 0,
    avgConfidence: all.length > 0 ? totalConfidence / all.length : 0,
    recentCount,
  }
}

// ─── Exploration Task CRUD ───────────────────────────────────────

export async function createExplorationTask(task: Omit<ExplorationTask, 'id' | 'createdAt'>): Promise<string> {
  const db = supabaseService()

  // Dedup: skip if same query is already pending/running
  const hash = task.query.toLowerCase().trim()
  const { data: dup } = await db
    .from('exploration_tasks')
    .select('id')
    .in('status', ['pending', 'running'])
    .eq('query', task.query)
    .limit(1)

  if (dup && dup.length > 0) {
    return dup[0].id as string  // Already queued
  }

  const { data, error } = await db
    .from('exploration_tasks')
    .insert({
      query: task.query,
      category: task.category,
      vertical: task.vertical,
      priority: task.priority,
      status: task.status,
      collector: task.collector,
      triggered_by: task.triggeredBy,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create task: ${error.message}`)
  return (data as { id: string }).id
}

export async function updateExplorationTask(
  id: string,
  updates: Partial<Pick<ExplorationTask, 'status' | 'collector' | 'resultCount' | 'error' | 'runAt'>>
): Promise<void> {
  const db = supabaseService()
  const row: Record<string, unknown> = {}
  if (updates.status !== undefined) row.status = updates.status
  if (updates.collector !== undefined) row.collector = updates.collector
  if (updates.resultCount !== undefined) row.result_count = updates.resultCount
  if (updates.error !== undefined) row.error = updates.error
  if (updates.runAt !== undefined) row.run_at = updates.runAt

  const { error } = await db.from('exploration_tasks').update(row).eq('id', id)
  if (error) {
    console.error('[updateExplorationTask]', error.message)
  }
}

export async function getPendingTasks(limit: number = 10): Promise<ExplorationTask[]> {
  const db = supabaseService()
  const { data, error } = await db
    .from('exploration_tasks')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error || !data) return []
  return data.map(rowToTask)
}

export async function getRecentTasks(limit: number = 20): Promise<ExplorationTask[]> {
  const db = supabaseService()
  const { data, error } = await db
    .from('exploration_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data.map(rowToTask)
}

// ─── Exploration Schedule ────────────────────────────────────────

export async function getExplorationSchedules(): Promise<ExplorationSchedule[]> {
  const db = supabaseService()
  const { data, error } = await db
    .from('exploration_schedule')
    .select('*')
    .order('topic')

  if (error || !data) return []
  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    topic: row.topic as string,
    category: row.category as KnowledgeCategory,
    vertical: row.vertical as string | null,
    cronExpr: row.cron_expr as string,
    enabled: row.enabled as boolean,
    lastRunAt: row.last_run_at as string | null,
    nextRunAt: row.next_run_at as string | null,
  }))
}

export async function updateScheduleLastRun(id: string): Promise<void> {
  const db = supabaseService()
  await db
    .from('exploration_schedule')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', id)
}

// ─── Row Mappers ─────────────────────────────────────────────────

function rowToEntry(row: Record<string, unknown>): KnowledgeEntry {
  return {
    id: row.id as string,
    category: row.category as KnowledgeCategory,
    vertical: row.vertical as string | null,
    region: row.region as string | null,
    tags: (row.tags as string[]) || [],
    title: row.title as string,
    summary: row.summary as string,
    fullContent: row.full_content as string | null,
    structured: (row.structured as Record<string, unknown>) || {},
    sourceType: row.source_type as KnowledgeEntry['sourceType'],
    sourceUrl: row.source_url as string | null,
    sourceQuery: row.source_query as string | null,
    confidence: (row.confidence as number) || 0,
    relevance: (row.relevance as number) || 0,
    freshness: (row.freshness as number) || 1,
    status: row.status as KnowledgeEntry['status'],
    supersededBy: row.superseded_by as string | null,
    expiresAt: row.expires_at as string | null,
    collectedAt: row.collected_at as string,
    collectedBy: row.collected_by as string,
  }
}

function rowToTask(row: Record<string, unknown>): ExplorationTask {
  return {
    id: row.id as string,
    query: row.query as string,
    category: row.category as KnowledgeCategory,
    vertical: row.vertical as string | null,
    priority: (row.priority as number) || 5,
    status: row.status as ExplorationTask['status'],
    collector: row.collector as string | null,
    resultCount: (row.result_count as number) || 0,
    error: row.error as string | null,
    triggeredBy: row.triggered_by as string,
    runAt: row.run_at as string | null,
    createdAt: row.created_at as string,
  }
}
