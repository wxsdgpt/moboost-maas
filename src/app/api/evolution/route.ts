/**
 * GET  /api/evolution         — Get latest report + pending decisions + agent registry snapshot
 * POST /api/evolution         — Trigger a diagnostic cycle
 * PATCH /api/evolution        — Approve or reject a decision
 */

import { NextRequest, NextResponse } from 'next/server'
import { evolution } from '@/agents/evolution'
import { agentRegistry } from '@/agents/registry'
import '@/agents/registry/bootstrap'

export const runtime = 'nodejs'

// ─── GET: Dashboard data ──────────────────────────────────────────────

export async function GET() {
  try {
    const [latestReport, pendingDecisions, registrySnapshot] = await Promise.all([
      evolution.getLatestReport(),
      evolution.getPendingDecisions(),
      Promise.resolve(agentRegistry.getSystemSnapshot()),
    ])

    return NextResponse.json({
      ok: true,
      report: latestReport,
      pendingDecisions,
      registry: registrySnapshot,
      executionPhases: agentRegistry.getExecutionPhases().map((phase) =>
        phase.map((a) => ({ id: a.id, nameZh: a.nameZh, status: a.status })),
      ),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

// ─── POST: Run diagnostic cycle ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const periodDays = (body as { periodDays?: number }).periodDays || 7

    const report = await evolution.runCycle(periodDays)

    return NextResponse.json({
      ok: true,
      report: {
        id: report.id,
        period: report.period,
        generatedAt: report.generatedAt,
        systemHealthScore: report.systemHealthScore,
        executiveSummary: report.executiveSummary,
        systemInsights: report.systemInsights,
        agentCount: report.agentHealth.length,
        decisionCount: report.decisions.length,
        decisions: report.decisions.map((d) => ({
          id: d.id,
          type: d.type,
          urgency: d.urgency,
          confidence: d.confidence,
          targetAgents: d.targetAgents,
          reasoning: d.reasoning,
          requiresHumanReview: d.requiresHumanReview,
          status: d.status,
        })),
        agentHealth: report.agentHealth.map((h) => ({
          agentId: h.agentId,
          stats: h.stats,
          userInteraction: h.userInteraction,
          trends: h.trends,
          anomalyCount: h.anomalies.length,
          anomalies: h.anomalies.map((a) => ({
            type: a.type,
            severity: a.severity,
            description: a.description,
          })),
        })),
      },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

// ─── PATCH: Approve/reject decision ───────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      decisionId: string
      action: 'approve' | 'reject'
    }

    if (!body.decisionId || !body.action) {
      return NextResponse.json(
        { ok: false, error: 'missing decisionId or action' },
        { status: 400 },
      )
    }

    if (body.action === 'approve') {
      await evolution.approveDecision(body.decisionId, 'human')
    } else {
      await evolution.rejectDecision(body.decisionId)
    }

    return NextResponse.json({ ok: true, decisionId: body.decisionId, action: body.action })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
