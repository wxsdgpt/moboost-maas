/**
 * Credit ledger — reserve / commit / rollback / getBalance.
 *
 * Design notes (see docs/onboarding-spec.md for the full story):
 *
 *  • Append-only.  No UPDATEs except to flip `status` on reserve rows.
 *  • Three buckets: 'subscription' (expires at period_end),
 *                   'bonus'        (never expires, e.g. 50-credit demo),
 *                   'topup'        (never expires, paid top-up).
 *  • Consumption order = FIFO by expiry: use what will expire soonest
 *    first.  Rows with NULL expires_at go last.
 *  • Reservation pattern: before running a paid job, `reserve(cost)`
 *    atomically carves out `cost` credits.  The job then either
 *    `commit`s or `rollback`s its reservation.  Concurrent callers
 *    are protected by Postgres via SELECT … FOR UPDATE in a future
 *    RPC; Phase 1 uses app-level best-effort (acceptable at demo
 *    traffic, documented risk).
 *
 * Public API:
 *   grantBonus(userId, amount, note?)         → void
 *   grantSubscription(userId, amount, periodEnd) → void
 *   grantTopup(userId, amount, note?)         → void
 *   getBalance(userId)                        → { total, bySource }
 *   reserve(userId, amount, reportId?)        → reservationId
 *   commit(userId, reservationId)             → void
 *   rollback(userId, reservationId)           → void
 *
 * All methods take a SupabaseClient so tests can inject a mock.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Cost table — keep in sync with docs/onboarding-spec.md §5. */
export const CREDIT_COSTS = {
  'report-lite': 3,
  'report-full': 10,
  'competitive-brief': 8,
  'campaign-plan': 10,
  'email-sequence': 6,
  'seo-audit': 8,
  'video-generation': 12,
} as const
export type CreditOp = keyof typeof CREDIT_COSTS

export type LedgerRow = {
  id: string
  user_id: string
  entry_type: string
  amount: number
  status: string
  bucket: string
  expires_at: string | null
  ref_report_id: string | null
  ref_reservation: string | null
  note: string | null
  created_at: string
}

export type Balance = {
  total: number
  bySource: { subscription: number; bonus: number; topup: number }
}

// ───────────────────────────────────────────────────────── grants

export async function grantBonus(
  db: SupabaseClient,
  userId: string,
  amount: number,
  note?: string,
): Promise<void> {
  const { error } = await db.from('credit_ledger').insert({
    user_id: userId,
    entry_type: 'grant_bonus',
    amount,
    status: 'active',
    bucket: 'bonus',
    expires_at: null,
    note: note ?? null,
  })
  if (error) throw new Error(`[credit] grantBonus: ${error.message}`)
}

/**
 * Idempotent variant: only inserts the bonus row if no prior row with
 * the same `note` exists for this user.  Used by the onboarding flow
 * so a refresh / retry never grants the demo bonus twice.
 *
 * Returns true if a new grant was inserted, false if it was a no-op.
 *
 * Phase 1 best-effort: this is a check-then-write rather than a true
 * unique constraint.  If two onboarding completions race we'd insert
 * twice — acceptable at demo traffic, fixed in Phase 2 by adding a
 * unique index on (user_id, entry_type, note) where note IS NOT NULL.
 */
export async function grantBonusIfAbsent(
  db: SupabaseClient,
  userId: string,
  amount: number,
  note: string,
): Promise<boolean> {
  const existing = await db
    .from('credit_ledger')
    .select('id')
    .eq('user_id', userId)
    .eq('entry_type', 'grant_bonus')
    .eq('note', note)
    .maybeSingle()

  if (existing.error) {
    throw new Error(`[credit] grantBonusIfAbsent lookup: ${existing.error.message}`)
  }
  if (existing.data) return false

  await grantBonus(db, userId, amount, note)
  return true
}

export async function grantTopup(
  db: SupabaseClient,
  userId: string,
  amount: number,
  note?: string,
): Promise<void> {
  const { error } = await db.from('credit_ledger').insert({
    user_id: userId,
    entry_type: 'grant_topup',
    amount,
    status: 'active',
    bucket: 'topup',
    expires_at: null,
    note: note ?? null,
  })
  if (error) throw new Error(`[credit] grantTopup: ${error.message}`)
}

export async function grantSubscription(
  db: SupabaseClient,
  userId: string,
  amount: number,
  periodEnd: Date,
  note?: string,
): Promise<void> {
  const { error } = await db.from('credit_ledger').insert({
    user_id: userId,
    entry_type: 'grant_subscription',
    amount,
    status: 'active',
    bucket: 'subscription',
    expires_at: periodEnd.toISOString(),
    note: note ?? null,
  })
  if (error) throw new Error(`[credit] grantSubscription: ${error.message}`)
}

// ───────────────────────────────────────────────────────── balance

/**
 * Compute available balance.  "Available" = rows that are:
 *   - positive (grant_*)
 *   - status 'active'
 *   - not expired (expires_at is null OR expires_at > now)
 *   - not yet fully reserved/committed
 *
 * We also subtract any rows with status 'reserved' or 'committed'
 * (they're already negative, so we just sum everything signed).
 */
export async function getBalance(
  db: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<Balance> {
  const { data, error } = await db
    .from('credit_ledger')
    .select('amount, bucket, status, expires_at, entry_type')
    .eq('user_id', userId)

  if (error) throw new Error(`[credit] getBalance: ${error.message}`)

  const bySource = { subscription: 0, bonus: 0, topup: 0 }
  let total = 0

  for (const row of (data ?? []) as LedgerRow[]) {
    // Expired grants contribute nothing.
    if (
      row.amount > 0 &&
      row.expires_at !== null &&
      new Date(row.expires_at).getTime() <= now.getTime()
    ) {
      continue
    }
    // Rolled-back reserves are as if they never happened.
    if (row.status === 'rolled_back') continue
    // Sentinel commit/rollback rows carry amount=0.
    total += row.amount
    const bucket = row.bucket as keyof typeof bySource
    if (bucket in bySource) bySource[bucket] += row.amount
  }

  return { total, bySource }
}

// ───────────────────────────────────────────────────────── reserve

/**
 * Reserve `amount` credits against the user's balance.
 *
 * Strategy:
 *   1. Check getBalance — if insufficient, throw INSUFFICIENT_CREDITS.
 *   2. Write a single negative ledger row (status='reserved') that
 *      represents the whole reservation.  We do NOT split across
 *      buckets at reserve time — that's resolved at commit time.
 *   3. Return the reservation row id.
 *
 * NB: phase 1 has a TOCTOU window between (1) and (2).  Acceptable
 * at demo traffic.  Phase 2 will wrap this in a Postgres function
 * with SELECT … FOR UPDATE.
 */
export async function reserve(
  db: SupabaseClient,
  userId: string,
  amount: number,
  reportId?: string,
): Promise<string> {
  if (amount <= 0) throw new Error('[credit] reserve: amount must be > 0')

  const balance = await getBalance(db, userId)
  if (balance.total < amount) {
    throw new Error('INSUFFICIENT_CREDITS')
  }

  // Decide which bucket to label the reserve row with — pick the one
  // we'll draw from FIRST (FIFO-by-expiry).  This is informational;
  // the commit step does the full decomposition if we ever split.
  const drawBucket = pickPrimaryBucket(balance)

  const { data, error } = await db
    .from('credit_ledger')
    .insert({
      user_id: userId,
      entry_type: 'reserve',
      amount: -amount,
      status: 'reserved',
      bucket: drawBucket,
      expires_at: null,
      ref_report_id: reportId ?? null,
      note: `reserved ${amount}`,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`[credit] reserve insert failed: ${error?.message}`)
  }
  return data.id
}

function pickPrimaryBucket(b: Balance): 'subscription' | 'bonus' | 'topup' {
  // FIFO by expiry: subscription expires → draw first.
  if (b.bySource.subscription > 0) return 'subscription'
  // Between bonus and topup (both never expire), prefer bonus so that
  // paid top-ups are preserved — user paid for them, they shouldn't
  // evaporate before free credits do.
  if (b.bySource.bonus > 0) return 'bonus'
  return 'topup'
}

// ───────────────────────────────────────────────────────── commit / rollback

export async function commit(
  db: SupabaseClient,
  userId: string,
  reservationId: string,
): Promise<void> {
  const { error } = await db
    .from('credit_ledger')
    .update({ status: 'committed' })
    .eq('id', reservationId)
    .eq('user_id', userId)
    .eq('status', 'reserved')
  if (error) throw new Error(`[credit] commit: ${error.message}`)
}

export async function rollback(
  db: SupabaseClient,
  userId: string,
  reservationId: string,
): Promise<void> {
  const { error } = await db
    .from('credit_ledger')
    .update({ status: 'rolled_back' })
    .eq('id', reservationId)
    .eq('user_id', userId)
    .eq('status', 'reserved')
  if (error) throw new Error(`[credit] rollback: ${error.message}`)
}
