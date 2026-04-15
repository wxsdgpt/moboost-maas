/**
 * Intelligence Processor — LLM-based content structuring
 * ========================================================
 *
 * Takes raw content from collectors and uses an LLM (via OpenRouter)
 * to structure it into knowledge entries with:
 *   - Categorization (competitor, trend, regulation, etc.)
 *   - Relevance scoring (0-1, how useful for iGaming MAAS)
 *   - Confidence scoring (0-1, how trustworthy the source)
 *   - Structured data extraction (varies by category)
 *   - Tag generation for search
 */

import type {
  RawContent,
  KnowledgeEntry,
  KnowledgeCategory,
  ProcessedIntelligence,
  ExplorationTask,
} from './types'
import { callLLM } from '@/lib/callLLM'

// ─── Main Processor ──────────────────────────────────────────────

/**
 * Process raw content into structured knowledge entries.
 *
 * @param rawContents - Raw content items from a collector
 * @param task - The exploration task that produced the content
 * @param model - OpenRouter model ID for processing
 * @returns Array of knowledge entries ready to be stored
 */
export async function processRawContent(
  rawContents: RawContent[],
  task: ExplorationTask,
  model: string = process.env.EVAL_MODEL || 'anthropic/claude-sonnet-4-6',
): Promise<KnowledgeEntry[]> {
  if (rawContents.length === 0) return []

  const entries: KnowledgeEntry[] = []

  for (const raw of rawContents) {
    try {
      // Truncate very long content to stay within token limits
      const truncatedText = raw.text.length > 8000
        ? raw.text.slice(0, 8000) + '\n\n[... content truncated for processing ...]'
        : raw.text

      const processed = await callLLMProcessor(truncatedText, task, model)

      if (!processed) continue

      entries.push({
        category: processed.category || task.category,
        vertical: processed.vertical || task.vertical,
        region: processed.region,
        tags: processed.tags,
        title: processed.title,
        summary: processed.summary.slice(0, 500),
        fullContent: raw.text,
        structured: processed.structured,
        sourceType: raw.sourceType,
        sourceUrl: raw.url,
        sourceQuery: task.query,
        confidence: Math.max(0, Math.min(1, processed.confidence)),
        relevance: Math.max(0, Math.min(1, processed.relevance)),
        freshness: 1.0,
        status: 'active',
        supersededBy: null,
        expiresAt: computeExpiryDate(processed.category),
        collectedAt: new Date().toISOString(),
        collectedBy: task.triggeredBy,
      })
    } catch (err) {
      // Failed to process content
    }
  }

  return entries
}

// ─── LLM Call ────────────────────────────────────────────────────

async function callLLMProcessor(
  content: string,
  task: ExplorationTask,
  model: string,
): Promise<ProcessedIntelligence | null> {
  const systemPrompt = `You are an intelligence analyst for Moboost AI, an iGaming Marketing-as-a-Service platform.
Your job is to extract structured intelligence from raw web content.

Context:
- Search query: "${task.query}"
- Target category: "${task.category}"
- Target vertical: ${task.vertical ? `"${task.vertical}"` : 'cross-vertical (all iGaming)'}

iGaming verticals we serve: Sports Betting, Casino, Slots, Poker, Lottery, Esports, Fantasy Sports, Bingo, Live Dealer, Crash Games.

Respond with a JSON object (no markdown, no code fences) with these fields:
{
  "title": "Concise title for this knowledge entry (≤80 chars)",
  "summary": "Structured summary of key findings (≤500 chars). Focus on actionable insights for iGaming marketing.",
  "category": "One of: competitor, trend, regulation, best_practice, technology, market_data",
  "tags": ["array", "of", "relevant", "tags", "for", "search"],
  "structured": {
    // Category-specific structured data:
    // For 'competitor': { "company": "", "strengths": [], "weaknesses": [], "strategies": [] }
    // For 'trend': { "trend_name": "", "impact": "high/medium/low", "timeframe": "", "affected_verticals": [] }
    // For 'regulation': { "jurisdiction": "", "effective_date": "", "impact": "", "compliance_notes": "" }
    // For 'best_practice': { "technique": "", "channel": "", "metrics": {}, "applicability": [] }
    // For 'technology': { "tech_name": "", "maturity": "", "adoption_rate": "", "use_cases": [] }
    // For 'market_data': { "metric": "", "value": "", "period": "", "source": "" }
  },
  "confidence": 0.0-1.0,    // How trustworthy is this source? (established media=0.8+, blog=0.5, unknown=0.3)
  "relevance": 0.0-1.0,     // How relevant to iGaming marketing? (direct iGaming=0.9+, tangential=0.3-0.5)
  "vertical": "Specific vertical or null if cross-vertical",
  "region": "ISO geo code or null if global"
}

IMPORTANT:
- If the content is NOT relevant to iGaming or digital marketing at all, set relevance to 0.0
- If the content is generic marketing (not iGaming specific), relevance should be 0.3-0.5
- Be concise. The summary should be information-dense, not fluffy.
- Tags should help with search: include vertical names, company names, technology names, regions mentioned.`

  const result = await callLLM({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this content:\n\n${content}` },
    ],
    caller: 'intelligence/processor',
    action: 'process_raw',
    temperature: 0.2,
    maxTokens: 1500,
    responseFormat: 'json',
  })

  try {
    const parsed = JSON.parse(result.content) as ProcessedIntelligence
    return parsed
  } catch {
    return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Compute an expiry date based on category.
 * Trends expire faster than regulations.
 */
function computeExpiryDate(category: KnowledgeCategory): string {
  const now = new Date()
  const daysMap: Record<KnowledgeCategory, number> = {
    trend: 30,
    market_data: 60,
    competitor: 90,
    technology: 90,
    best_practice: 180,
    regulation: 365,
  }
  const days = daysMap[category] || 90
  now.setDate(now.getDate() + days)
  return now.toISOString()
}
