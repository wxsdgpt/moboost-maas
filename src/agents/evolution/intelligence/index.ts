/**
 * Intelligence Module — Public API
 * ==================================
 *
 * The autonomous internet exploration system for Moboost AI.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Exploration Schedule / PCEC / Admin Manual Trigger         │
 *   └──────────────────────────┬──────────────────────────────────┘
 *                              │
 *   ┌──────────────────────────▼──────────────────────────────────┐
 *   │  Orchestrator                                                │
 *   │  - Picks tasks from queue                                    │
 *   │  - Routes to best available collector                        │
 *   │  - Manages pipeline: collect → process → store               │
 *   └──────────────────────────┬──────────────────────────────────┘
 *                              │
 *   ┌──────────────────────────▼──────────────────────────────────┐
 *   │  Collectors (pluggable)                                      │
 *   │  ┌─────────────┐ ┌──────────┐ ┌───────┐ ┌───────────────┐  │
 *   │  │ Perplexity   │ │ Crawler  │ │  API  │ │ Chrome MCP    │  │
 *   │  │ (L1, prod)   │ │ (L2,todo)│ │(L3,td)│ │ (L1, cowork)  │  │
 *   │  └──────┬───────┘ └────┬─────┘ └───┬───┘ └──────┬────────┘  │
 *   └─────────┼──────────────┼───────────┼────────────┼───────────┘
 *             │              │           │            │
 *   ┌─────────▼──────────────▼───────────▼────────────▼───────────┐
 *   │  Processor (LLM via OpenRouter)                              │
 *   │  - Categorize, score relevance/confidence                    │
 *   │  - Extract structured data                                   │
 *   │  - Generate tags                                             │
 *   └──────────────────────────┬──────────────────────────────────┘
 *                              │
 *   ┌──────────────────────────▼──────────────────────────────────┐
 *   │  Store (Supabase: industry_knowledge)                        │
 *   │  - Dedup, supersession, freshness decay                     │
 *   │  - Query by category/vertical/tags/relevance                │
 *   └─────────────────────────────────────────────────────────────┘
 */

// Core types
export type {
  KnowledgeEntry,
  KnowledgeCategory,
  ExplorationTask,
  ExplorationSchedule,
  RawContent,
  CollectionResult,
  IntelligenceCollector,
  ProcessedIntelligence,
  ExplorationConfig,
} from './types'
export { KNOWLEDGE_CATEGORIES, SOURCE_TYPES, DEFAULT_EXPLORATION_CONFIG } from './types'
export type { ExplorationRunResult } from './orchestrator'

// Store operations
export {
  saveKnowledge,
  saveKnowledgeBatch,
  queryKnowledge,
  getKnowledgeStats,
  createExplorationTask,
  updateExplorationTask,
  getPendingTasks,
  getRecentTasks,
  getExplorationSchedules,
} from './store'

// Orchestrator
export {
  runExploration,
  quickExplore,
  generateGapTasks,
} from './orchestrator'

// Processor
export { processRawContent } from './processor'

// Collectors
export { PerplexityCollector } from './collectors/perplexity'
