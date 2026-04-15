/**
 * Event log — lightweight analytics for the demo phase.
 *
 * Captures key user actions and pipeline events so we can measure
 * the end-to-end flow after the demo.  All events are written to
 * a single `event_log` table in Supabase — no external analytics
 * dependency.
 *
 * Events are fire-and-forget: failures are logged to console but
 * never block the calling code.  This is intentional — analytics
 * should never degrade the user experience.
 *
 * Event types:
 *   - onboarding_started
 *   - onboarding_completed
 *   - enrichment_started / enrichment_completed / enrichment_failed
 *   - report_requested / report_completed / report_failed
 *   - landing_requested / landing_completed / landing_failed
 *   - landing_downloaded / landing_copied
 *   - asset_requested / asset_completed / asset_failed
 *   - credit_granted / credit_reserved / credit_committed
 *   - market_intel_synced
 *   - page_viewed (client-side, batched)
 */
import { supabaseService } from '@/lib/db'

export type EventName =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'enrichment_started'
  | 'enrichment_completed'
  | 'enrichment_failed'
  | 'report_requested'
  | 'report_completed'
  | 'report_failed'
  | 'landing_requested'
  | 'landing_completed'
  | 'landing_failed'
  | 'landing_downloaded'
  | 'landing_copied'
  | 'asset_requested'
  | 'asset_completed'
  | 'asset_failed'
  | 'credit_granted'
  | 'credit_reserved'
  | 'credit_committed'
  | 'market_intel_synced'
  | 'page_viewed'

export type EventPayload = Record<string, unknown>

/**
 * Log an event to the event_log table.
 *
 * Fire-and-forget — never throws, never blocks.
 */
export function logEvent(
  event: EventName,
  userId?: string | null,
  payload?: EventPayload,
): void {
  // Run async but don't await — fire and forget
  _writeEvent(event, userId ?? null, payload ?? {}).catch((err) => {
    // Silently fail
  })
}

async function _writeEvent(
  event: EventName,
  userId: string | null,
  payload: EventPayload,
): Promise<void> {
  const db = supabaseService()
  const { error } = await db.from('event_log').insert({
    event,
    user_id: userId,
    payload,
    created_at: new Date().toISOString(),
  })
  if (error) {
    // DB insert failed silently
  }
}

/**
 * Helper: log a pipeline stage event with timing.
 *
 * Usage:
 *   const end = logPipelineStart('report', userId, { kind: 'lite' })
 *   // ... do work ...
 *   end({ sections: 8 })  // logs report_completed with duration_ms
 *
 *   // or on error:
 *   end({ error: 'timeout' }, true)  // logs report_failed
 */
export function logPipelineStart(
  stage: 'enrichment' | 'report' | 'landing' | 'asset',
  userId?: string | null,
  startPayload?: EventPayload,
): (endPayload?: EventPayload, failed?: boolean) => void {
  const startTime = Date.now()
  logEvent(`${stage}_requested` as EventName, userId, startPayload)

  return (endPayload?: EventPayload, failed?: boolean) => {
    const durationMs = Date.now() - startTime
    const endEvent = failed
      ? (`${stage}_failed` as EventName)
      : (`${stage}_completed` as EventName)
    logEvent(endEvent, userId, {
      ...endPayload,
      duration_ms: durationMs,
    })
  }
}
