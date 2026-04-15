/**
 * Perplexity Collector — Web Search via OpenRouter
 * ==================================================
 *
 * Uses Perplexity's sonar-pro model through OpenRouter to perform
 * real-time web searches. This is the primary Layer 1 collector
 * because it works in production (server-side, no browser needed).
 *
 * How it works:
 *   1. Sends the search query to Perplexity with iGaming context
 *   2. Perplexity searches the web and returns a synthesized answer
 *      with source citations
 *   3. We parse the response into RawContent items
 *
 * Advantages:
 *   - Works server-side (no browser, no Chrome MCP)
 *   - Returns synthesized, pre-processed content
 *   - Includes source URLs for citation
 *   - Fast (~3-5s per query)
 *
 * Limitations:
 *   - Content is already LLM-processed (not raw HTML)
 *   - Can't access paywalled content
 *   - Rate limited by OpenRouter quotas
 */

import type {
  IntelligenceCollector,
  ExplorationTask,
  RawContent,
} from '../types'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

export class PerplexityCollector implements IntelligenceCollector {
  readonly name = 'perplexity'
  readonly sourceType = 'perplexity' as const
  private model: string

  constructor(model: string = 'perplexity/sonar-pro') {
    this.model = model
  }

  isAvailable(): boolean {
    return !!OPENROUTER_KEY
  }

  async collect(task: ExplorationTask): Promise<RawContent[]> {
    if (!this.isAvailable()) {
      throw new Error('OpenRouter API key not configured')
    }

    const results: RawContent[] = []

    // ─── Phase 1: Deep search with context ───────────────────────
    const searchPrompt = buildSearchPrompt(task)

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI Intelligence Collector',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a research assistant for an iGaming Marketing-as-a-Service platform called Moboost AI.
Your goal is to find the most recent, relevant, and actionable information about the given topic.
Focus on:
- Real data, statistics, and concrete examples
- Recent developments (2025-2026)
- Practical implications for iGaming marketing
- Specific company names, products, and strategies
- Regulatory changes and compliance requirements

Always cite your sources with URLs when available.
Structure your response clearly with sections.`,
          },
          {
            role: 'user',
            content: searchPrompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Perplexity search failed (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const citations = data.citations || []

    if (!content) {
      return []
    }

    // ─── Parse response into RawContent items ────────────────────
    // Perplexity returns a single synthesized response.
    // We treat it as one main content item.
    results.push({
      url: null,
      title: `Search: ${task.query}`,
      text: content,
      extractedAt: new Date().toISOString(),
      sourceType: 'perplexity',
      metadata: {
        model: this.model,
        citations,
        queryCategory: task.category,
      },
    })

    // ─── Phase 2: Extract cited sources as separate items ────────
    // If Perplexity returned citations, create separate entries
    // so we can track individual sources
    if (Array.isArray(citations) && citations.length > 0) {
      for (const citation of citations.slice(0, 5)) {
        const url = typeof citation === 'string' ? citation : (citation as { url?: string })?.url
        if (url) {
          results.push({
            url,
            title: `Source: ${extractDomain(url)}`,
            text: `[Cited source from Perplexity search for "${task.query}"]`,
            extractedAt: new Date().toISOString(),
            sourceType: 'perplexity',
            metadata: { isCitation: true, parentQuery: task.query },
          })
        }
      }
    }

    // ─── Phase 3: Follow-up for specific angles ──────────────────
    // If the initial search was broad, do targeted follow-ups
    if (task.priority >= 7) {
      try {
        const followUp = await this.collectFollowUp(task, content)
        results.push(...followUp)
      } catch (err) {
        // Follow-up is best-effort, don't fail the whole collection
      }
    }

    return results
  }

  /**
   * Follow-up search for high-priority tasks.
   * Asks more specific questions based on initial findings.
   */
  private async collectFollowUp(
    task: ExplorationTask,
    initialFindings: string,
  ): Promise<RawContent[]> {
    const followUpPrompt = `Based on these initial findings about "${task.query}":

${initialFindings.slice(0, 2000)}

Now dig deeper: What are the specific numbers, case studies, or recent examples (2025-2026) that support these findings?
Focus on actionable data for iGaming marketing teams.
Include specific metrics, conversion rates, or ROI figures if available.`

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moboost.ai',
        'X-Title': 'Moboost AI Intelligence Collector',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant specializing in iGaming marketing data and statistics. Provide specific, verifiable data points.',
          },
          { role: 'user', content: followUpPrompt },
        ],
        temperature: 0.1,
        max_tokens: 3000,
      }),
    })

    if (!response.ok) return []

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    if (!content) return []

    return [{
      url: null,
      title: `Deep-dive: ${task.query}`,
      text: content,
      extractedAt: new Date().toISOString(),
      sourceType: 'perplexity',
      metadata: {
        model: this.model,
        isFollowUp: true,
        parentQuery: task.query,
      },
    }]
  }
}

// ─── Prompt Builders ─────────────────────────────────────────────

function buildSearchPrompt(task: ExplorationTask): string {
  const verticalContext = task.vertical
    ? `Focus specifically on the "${task.vertical}" vertical within iGaming.`
    : 'Cover the broader iGaming industry.'

  const categoryGuide: Record<string, string> = {
    competitor: `Find information about major competitors, their marketing strategies, features, and market positioning. Look for recent product launches, acquisitions, or strategy changes.`,
    trend: `Identify emerging trends, shifts in user behavior, new marketing channels, and changing patterns. Focus on what's different in 2025-2026 compared to previous years.`,
    regulation: `Find recent regulatory changes, compliance requirements, advertising restrictions, and licensing updates. Note specific jurisdictions and effective dates.`,
    best_practice: `Find proven marketing strategies, successful campaign examples, optimization techniques, and industry benchmarks. Include specific metrics where possible.`,
    technology: `Identify new technologies being adopted in iGaming marketing: AI tools, programmatic platforms, creative automation, personalization engines, etc.`,
    market_data: `Find market size data, growth rates, user demographics, spending patterns, and industry forecasts. Include specific numbers and sources.`,
  }

  return `Research the following topic thoroughly:

"${task.query}"

${verticalContext}

${categoryGuide[task.category] || ''}

Requirements:
1. Focus on the most recent information (2025-2026 preferred)
2. Include specific data points, statistics, and examples
3. Name specific companies, platforms, or products when relevant
4. Note any geographic/regional variations
5. Highlight actionable insights for a marketing team
6. Cite sources with URLs where possible`
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}
