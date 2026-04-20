/**
 * Outbound webhook to notify collaborators when artifacts change.
 *
 * Fire-and-forget: failures are logged but never block the originating
 * request. Body is HMAC-SHA256-signed using COLLAB_WEBHOOK_SECRET; the
 * signature lands in the `X-Moboost-Signature` header as `sha256=<hex>`.
 *
 * Events:
 *   - asset.created       — new image/video persisted
 *   - asset.regenerated   — regenerate-creative produced a new row
 *   - landing.created     — initial landing page generated
 *   - landing.regenerated — regenerate-landing produced a new row
 */

import crypto from 'node:crypto'

export type CollabEvent =
  | 'asset.created'
  | 'asset.regenerated'
  | 'landing.created'
  | 'landing.regenerated'

export async function notifyCollab(
  event: CollabEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.COLLAB_WEBHOOK_URL
  const secret = process.env.COLLAB_WEBHOOK_SECRET
  if (!url) return

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    payload,
  })
  const sig = secret
    ? 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
    : ''

  // Fire-and-forget: do not await in callers; we still await internally
  // to surface logs in a controlled way.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sig ? { 'X-Moboost-Signature': sig } : {}),
        'X-Moboost-Event': event,
      },
      body,
      // No retry: collaborator side should re-poll /exports if it
      // suspects a missed delivery.
    })
    if (!res.ok) {
      console.warn(`[collab-webhook] ${event} → ${res.status}`)
    }
  } catch (e) {
    console.warn(`[collab-webhook] ${event} failed:`, (e as Error).message)
  }
}
