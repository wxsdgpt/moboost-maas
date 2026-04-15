/**
 * Intelligence Orchestrator — Autonomous Exploration Engine
 * ===========================================================
 *
 * Coordinates the full intelligence collection pipeline:
 *   1. Pick tasks (from schedule or manual queue)
 *   2. Route to appropriate collector
 *   3. Process raw content with LLM
 *   4. Store in knowledge base
 *   5. Report results
 *
 * This is the "brain" of the autonomous navigation chain.
 * Called by:
 *   - PCEC cycle (automated)
 *   - Admin API (manual trigger)
 *   - Scheduled tasks (cron)
 */

import { PerplexityCollector } from './collectors/perplexity'
import { processRawContent } from './processor'
import {
  saveKnowledgeBatch,
  createExplorationTask,
  updateExplorationTask,
  getPendingTasks,
  getExplorationSchedules,
  updateScheduleLastRun,
} from './store'
import type {
  IntelligenceCollector,
  ExplorationTask,
  ExplorationConfig,
  CollectionResult,
  KnowledgeCategory,
  DEFAULT_EXPLORATION_CONFIG,
} from './types'
import { DEFAULT_EXPLORATION_CONFIG as defaultConfig } from './types'

// ─── Collector Registry ──────────────────────────────────────────

const collectors: Map<string, IntelligenceCollector> = new Map()

function registerCollector(collector: IntelligenceCollector) {
  collectors.set(collector.name, collector)
}

// Register default collectors
registerCollector(new PerplexityCollector())

/**
 * Get the best available collector.
 * Falls through the priority chain until it finds one that's available.
 */
async function getBestCollector(
  preferred: string[] = ['perplexity'],
): Promise<IntelligenceCollector | null> {
  for (const name of preferred) {
    const collector = collectors.get(name)
    if (collector) {
      const available = await collector.isAvailable()
      if (available) return collector
    }
  }
  return null
}

// ─── Main Exploration Run ────────────────────────────────────────

export interface ExplorationRunResult {
  runId: string
  startedAt: string
  completedAt: string
  tasksProcessed: number
  tasksSucceeded: number
  tasksFailed: number
  entriesCreated: number
  results: CollectionResult[]
  log: string[]
}

/**
 * Run a full exploration cycle.
 *
 * This is the main entry point called by PCEC or admin API.
 * It processes pending tasks and creates new ones from the schedule.
 */
export async function runExploration(
  config: Partial<ExplorationConfig> = {},
): Promise<ExplorationRunResult> {
  const cfg = { ...defaultConfig, ...config }
  const runId = `explore_${Date.now()}`
  const startedAt = new Date().toISOString()
  const log: string[] = []
  const results: CollectionResult[] = []

  log.push(`[Explore] Run ${runId} started`)
  log.push(`[Explore] Config: collectors=${cfg.collectors.join(',')}, maxEntries=${cfg.maxEntriesPerRun}`)

  // ─── Step 1: Check for scheduled topics due for refresh ────────
  log.push('[Explore] Step 1: Checking exploration schedule...')
  try {
    const schedules = await getExplorationSchedules()
    const enabled = schedules.filter((s) => s.enabled)
    let scheduledCount = 0

    for (const schedule of enabled) {
      // Simple check: if never run or last run > 7 days ago, queue it
      const shouldRun = !schedule.lastRunAt ||
        (Date.now() - new Date(schedule.lastRunAt).getTime() > 7 * 24 * 60 * 60 * 1000)

      if (shouldRun) {
        try {
          await createExplorationTask({
            query: schedule.topic,
            category: schedule.category as KnowledgeCategory,
            vertical: schedule.vertical,
            priority: 5,
            status: 'pending',
            collector: null,
            resultCount: 0,
            error: null,
            triggeredBy: 'scheduled',
            runAt: null,
          })
          await updateScheduleLastRun(schedule.id)
          scheduledCount++
        } catch {
          // Dedup will catch duplicates silently
        }
      }
    }

    log.push(`[Explore] Queued ${scheduledCount} scheduled topics`)
  } catch (err) {
    log.push(`[Explore] Schedule check failed: ${(err as Error).message}`)
  }

  // ─── Step 2: Get pending tasks ─────────────────────────────────
  log.push('[Explore] Step 2: Fetching pending tasks...')
  const tasks = await getPendingTasks(cfg.maxEntriesPerRun)
  log.push(`[Explore] Found ${tasks.length} pending tasks`)

  if (tasks.length === 0) {
    log.push('[Explore] No tasks to process, run complete')
    return buildRunResult(runId, startedAt, results, log)
  }

  // ─── Step 3: Get best available collector ──────────────────────
  const collector = await getBestCollector(cfg.collectors)
  if (!collector) {
    log.push('[Explore] ERROR: No collector available!')
    return buildRunResult(runId, startedAt, results, log)
  }
  log.push(`[Explore] Using collector: ${collector.name}`)

  // ─── Step 4: Process tasks ─────────────────────────────────────
  let totalEntries = 0

  for (const task of tasks) {
    if (totalEntries >= cfg.maxEntriesPerRun) {
      log.push(`[Explore] Hit max entries (${cfg.maxEntriesPerRun}), stopping`)
      break
    }

    const taskStart = Date.now()
    log.push(`[Explore] Processing: "${task.query}" [${task.category}]`)

    try {
      // Mark as running
      await updateExplorationTask(task.id!, {
        status: 'running',
        collector: collector.name,
        runAt: new Date().toISOString(),
      })

      // ─── Collect ───────────────────────────────────────────────
      log.push(`[Explore]   → Collecting via ${collector.name}...`)
      const rawContents = await collector.collect(task)
      log.push(`[Explore]   → Got ${rawContents.length} raw content items`)

      if (rawContents.length === 0) {
        await updateExplorationTask(task.id!, {
          status: 'completed',
          resultCount: 0,
        })
        results.push({
          task,
          rawContents: [],
          entries: [],
          duration: Date.now() - taskStart,
          log: ['No content found'],
        })
        continue
      }

      // ─── Process with LLM ─────────────────────────────────────
      log.push(`[Explore]   → Processing with LLM (${cfg.processorModel})...`)
      const entries = await processRawContent(rawContents, task, cfg.processorModel)
      log.push(`[Explore]   → Produced ${entries.length} knowledge entries`)

      // ─── Filter by relevance ───────────────────────────────────
      const relevant = entries.filter((e) => e.relevance >= cfg.relevanceThreshold)
      log.push(`[Explore]   → ${relevant.length} entries above relevance threshold (${cfg.relevanceThreshold})`)

      // ─── Store ─────────────────────────────────────────────────
      if (relevant.length > 0) {
        log.push(`[Explore]   → Saving to knowledge base...`)
        const savedIds = await saveKnowledgeBatch(relevant)
        log.push(`[Explore]   → Saved ${savedIds.length} entries`)
        totalEntries += savedIds.length
      }

      // ─── Update task ───────────────────────────────────────────
      await updateExplorationTask(task.id!, {
        status: 'completed',
        resultCount: relevant.length,
      })

      results.push({
        task,
        rawContents,
        entries: relevant,
        duration: Date.now() - taskStart,
        log: [`Collected ${rawContents.length} items, stored ${relevant.length} entries`],
      })

      log.push(`[Explore]   ✅ Done in ${Date.now() - taskStart}ms`)

    } catch (err) {
      const errorMsg = (err as Error).message
      log.push(`[Explore]   ❌ Failed: ${errorMsg}`)

      await updateExplorationTask(task.id!, {
        status: 'failed',
        error: errorMsg,
      })

      results.push({
        task,
        rawContents: [],
        entries: [],
        duration: Date.now() - taskStart,
        log: [`Error: ${errorMsg}`],
      })
    }
  }

  log.push(`[Explore] Run complete. Processed: ${results.length}, Entries created: ${totalEntries}`)

  return buildRunResult(runId, startedAt, results, log)
}

// ─── Quick Explore (single query) ────────────────────────────────

/**
 * Quick explore: run a single query without creating a persistent task.
 * Good for admin testing or one-off research.
 */
export async function quickExplore(
  query: string,
  category: KnowledgeCategory = 'trend',
  vertical: string | null = null,
): Promise<CollectionResult> {
  const task: ExplorationTask = {
    query,
    category,
    vertical,
    priority: 8,
    status: 'running',
    collector: null,
    resultCount: 0,
    error: null,
    triggeredBy: 'manual',
    runAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }

  // Create persistent task for tracking
  const taskId = await createExplorationTask({
    ...task,
    status: 'pending',
  })
  task.id = taskId

  const collector = await getBestCollector()
  if (!collector) {
    throw new Error('No intelligence collector available. Check OpenRouter API key.')
  }

  const start = Date.now()

  try {
    await updateExplorationTask(taskId, { status: 'running', collector: collector.name })

    const rawContents = await collector.collect(task)
    const entries = await processRawContent(rawContents, task)
    const relevant = entries.filter((e) => e.relevance >= 0.3)

    if (relevant.length > 0) {
      await saveKnowledgeBatch(relevant)
    }

    await updateExplorationTask(taskId, {
      status: 'completed',
      resultCount: relevant.length,
    })

    return {
      task: { ...task, status: 'completed', resultCount: relevant.length },
      rawContents,
      entries: relevant,
      duration: Date.now() - start,
      log: [`Quick explore: ${rawContents.length} raw → ${relevant.length} stored`],
    }

  } catch (err) {
    await updateExplorationTask(taskId, {
      status: 'failed',
      error: (err as Error).message,
    })
    throw err
  }
}

// ─── Generate Exploration Tasks from Gap Analysis ────────────────

/**
 * Generate new exploration tasks based on what we DON'T know yet.
 * This feeds the Domain Gap Analysis proactive evolution mechanism.
 */
export async function generateGapTasks(
  existingCategories: Record<string, number>,
): Promise<string[]> {
  const gaps: Array<{ query: string; category: KnowledgeCategory; priority: number }> = []

  // Check which categories are under-represented
  const categoryTargets: Record<string, number> = {
    competitor: 10,
    trend: 15,
    regulation: 5,
    best_practice: 10,
    technology: 8,
    market_data: 8,
  }

  for (const [cat, target] of Object.entries(categoryTargets)) {
    const current = existingCategories[cat] || 0
    if (current < target) {
      const category = cat as KnowledgeCategory
      const queries = getGapQueries(category)
      for (const q of queries.slice(0, Math.min(3, target - current))) {
        gaps.push({ query: q, category, priority: 6 })
      }
    }
  }

  // Create tasks
  const ids: string[] = []
  for (const gap of gaps) {
    try {
      const id = await createExplorationTask({
        query: gap.query,
        category: gap.category,
        vertical: null,
        priority: gap.priority,
        status: 'pending',
        collector: null,
        resultCount: 0,
        error: null,
        triggeredBy: 'gap_analysis',
        runAt: null,
      })
      ids.push(id)
    } catch {
      // Dedup catches duplicates
    }
  }

  return ids
}

// ─── Helpers ─────────────────────────────────────────────────────

function getGapQueries(category: KnowledgeCategory): string[] {
  const queryBank: Record<KnowledgeCategory, string[]> = {
    competitor: [
      'top iGaming marketing platforms 2026 comparison',
      'Bet365 marketing strategy digital advertising',
      'DraftKings FanDuel user acquisition methods',
      'emerging iGaming operators marketing innovation',
      'igaming affiliate marketing trends leaders',
    ],
    trend: [
      'iGaming advertising trends 2026',
      'AI in igaming marketing creative optimization',
      'mobile-first igaming campaigns performance',
      'social media gambling advertising effectiveness',
      'personalization in igaming user retention',
    ],
    regulation: [
      'gambling advertising regulations 2026 update',
      'UKGC advertising standards changes',
      'US state by state sports betting advertising rules',
      'EU digital gambling marketing compliance',
      'responsible gambling advertising requirements',
    ],
    best_practice: [
      'highest converting igaming landing pages design',
      'sports betting promotional offer strategies',
      'casino welcome bonus marketing optimization',
      'igaming email marketing best practices',
      'igaming creative A/B testing strategies',
    ],
    technology: [
      'AI creative generation tools igaming advertising',
      'programmatic advertising platforms igaming',
      'real-time bidding igaming campaigns',
      'dynamic creative optimization gambling ads',
      'marketing automation platforms for igaming',
    ],
    market_data: [
      'global igaming market size 2026 forecast',
      'online gambling user demographics trends',
      'igaming customer acquisition cost benchmarks',
      'sports betting market growth by region',
      'igaming advertising spend statistics 2026',
    ],
  }

  return queryBank[category] || []
}

function buildRunResult(
  runId: string,
  startedAt: string,
  results: CollectionResult[],
  log: string[],
): ExplorationRunResult {
  return {
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    tasksProcessed: results.length,
    tasksSucceeded: results.filter((r) => r.task.status === 'completed').length,
    tasksFailed: results.filter((r) => r.task.status === 'failed').length,
    entriesCreated: results.reduce((sum, r) => sum + r.entries.length, 0),
    results,
    log,
  }
}
