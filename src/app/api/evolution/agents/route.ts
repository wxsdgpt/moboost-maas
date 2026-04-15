/**
 * GET  /api/evolution/agents         — List all agents with stats
 * GET  /api/evolution/agents?id=X    — Get single agent detail + health report
 */

import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/agents/registry'
import { evolution } from '@/agents/evolution'
import '@/agents/registry/bootstrap'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('id')

  try {
    if (agentId) {
      // Single agent detail
      const definition = agentRegistry.get(agentId)
      if (!definition) {
        return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const now = new Date().toISOString()

      const [stats, recentLogs] = await Promise.all([
        evolution.getAgentStats(agentId, sevenDaysAgo, now),
        evolution.queryLogs({ agentId, limit: 20 }),
      ])

      return NextResponse.json({
        ok: true,
        agent: {
          ...definition,
          stats,
          recentLogs: recentLogs.map((l) => ({
            id: l.id,
            runId: l.runId,
            status: l.outputSummary.status || 'unknown',
            durationMs: l.metrics.durationMs,
            userAction: l.userAction,
            qualityScore: l.qualityScore,
            createdAt: l.createdAt,
          })),
        },
      })
    }

    // List all agents
    const agents = agentRegistry.getAll()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const agentsWithStats = await Promise.all(
      agents.map(async (a) => {
        const stats = await evolution.getAgentStats(a.id, sevenDaysAgo, now)
        return {
          id: a.id,
          nameZh: a.nameZh,
          nameEn: a.nameEn,
          category: a.category,
          status: a.status,
          version: a.version,
          capabilities: a.capabilities,
          dependencies: a.dependencies,
          origin: a.origin,
          stats,
        }
      }),
    )

    return NextResponse.json({ ok: true, agents: agentsWithStats })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
