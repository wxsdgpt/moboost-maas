/**
 * Intelligence Collection — Type Definitions
 * ============================================
 *
 * Core types for the autonomous internet exploration system.
 * The system collects industry intelligence to feed proactive evolution:
 *   - Self-Test: benchmarks against industry standards
 *   - Cross-Eval: competitor capability comparison
 *   - Capability Audit: feature gap identification
 *   - Domain Gap Analysis: market trend awareness
 */

// ─── Knowledge Categories ────────────────────────────────────────

export const KNOWLEDGE_CATEGORIES = [
  'competitor',      // Competitor products, features, strategies
  'trend',           // Industry trends, emerging patterns
  'regulation',      // Legal/compliance updates
  'best_practice',   // Proven marketing/creative strategies
  'technology',      // New tech, tools, platforms
  'market_data',     // Market size, growth rates, statistics
] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

// ─── Source Types ────────────────────────────────────────────────

export const SOURCE_TYPES = [
  'perplexity',   // L1: Perplexity via OpenRouter (web search LLM)
  'websearch',    // L1: Claude WebSearch (Cowork only)
  'chrome_mcp',   // L1: Chrome MCP extraction (Cowork only)
  'crawler',      // L2: Server-side crawlers (Playwright/Cheerio)
  'api',          // L3: Third-party APIs
  'agent',        // L4: Local agents (Claude Code, etc.)
  'manual',       // Manual admin input
] as const

export type SourceType = (typeof SOURCE_TYPES)[number]

// ─── Knowledge Entry ─────────────────────────────────────────────

export interface KnowledgeEntry {
  id?: string
  category: KnowledgeCategory
  vertical: string | null
  region: string | null
  tags: string[]
  title: string
  summary: string          // ≤500 chars LLM-structured summary
  fullContent: string | null
  structured: Record<string, unknown>
  sourceType: SourceType
  sourceUrl: string | null
  sourceQuery: string | null
  confidence: number       // 0-1
  relevance: number        // 0-1
  freshness: number        // 0-1
  status: 'active' | 'stale' | 'archived' | 'superseded'
  supersededBy: string | null
  expiresAt: string | null
  collectedAt: string
  collectedBy: string
}

// ─── Exploration Task ────────────────────────────────────────────

export interface ExplorationTask {
  id?: string
  query: string
  category: KnowledgeCategory
  vertical: string | null
  priority: number         // 1-10
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  collector: string | null
  resultCount: number
  error: string | null
  triggeredBy: string
  runAt: string | null
  createdAt: string
}

// ─── Exploration Schedule ────────────────────────────────────────

export interface ExplorationSchedule {
  id: string
  topic: string
  category: KnowledgeCategory
  vertical: string | null
  cronExpr: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
}

// ─── Collector Interface ─────────────────────────────────────────

/**
 * Raw content extracted from a source before LLM processing.
 */
export interface RawContent {
  url: string | null
  title: string
  text: string
  extractedAt: string
  sourceType: SourceType
  metadata?: Record<string, unknown>
}

/**
 * Result from a single collection run.
 */
export interface CollectionResult {
  task: ExplorationTask
  rawContents: RawContent[]
  entries: KnowledgeEntry[]
  duration: number         // ms
  log: string[]
}

/**
 * Every collector must implement this interface.
 * The orchestrator calls `collect()` and the collector handles
 * search → extract → return raw content.
 */
export interface IntelligenceCollector {
  readonly name: string
  readonly sourceType: SourceType
  readonly isAvailable: () => boolean | Promise<boolean>

  /**
   * Execute a collection task: search for the query, extract content,
   * return raw content items for LLM processing.
   */
  collect(task: ExplorationTask): Promise<RawContent[]>
}

// ─── LLM Processing ─────────────────────────────────────────────

/**
 * Structured output from LLM processing of raw content.
 */
export interface ProcessedIntelligence {
  title: string
  summary: string
  category: KnowledgeCategory
  tags: string[]
  structured: Record<string, unknown>
  confidence: number
  relevance: number
  vertical: string | null
  region: string | null
}

// ─── Orchestrator Config ─────────────────────────────────────────

export interface ExplorationConfig {
  /** Max concurrent collection tasks */
  concurrency: number
  /** Max entries per collection run */
  maxEntriesPerRun: number
  /** Minimum relevance score to store (0-1) */
  relevanceThreshold: number
  /** Which collectors to use, in priority order */
  collectors: SourceType[]
  /** LLM model for processing (via OpenRouter) */
  processorModel: string
  /** LLM model for web search (Perplexity) */
  searchModel: string
}

export const DEFAULT_EXPLORATION_CONFIG: ExplorationConfig = {
  concurrency: 3,
  maxEntriesPerRun: 50,
  relevanceThreshold: 0.3,
  collectors: ['perplexity'],
  processorModel: process.env.EVAL_MODEL || 'anthropic/claude-sonnet-4-6',
  searchModel: 'perplexity/sonar-pro',
}
