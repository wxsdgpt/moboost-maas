/**
 * Clerk ↔ Supabase bridge.
 *
 * Rather than setting up a Clerk webhook to push user.created events
 * into Supabase, Phase 1 uses a "lazy create" pattern: the first time
 * any authenticated server path sees a new Clerk userId, we insert
 * a matching row into `public.users` and return its internal UUID.
 *
 * This keeps Phase 1 deployable without any webhook/ngrok dance.
 * When we move to Phase 2+ we can swap this for an event-driven sync
 * without changing callers — the public API stays stable.
 */
import { auth, currentUser } from '@clerk/nextjs/server'
import { supabaseService } from './db'

export type MoboostUser = {
  id: string            // internal Supabase uuid
  clerkUserId: string
  email: string | null
  createdAt: string
}

/**
 * Resolve the current Clerk user to a moboost user row.
 * Returns null if not signed in.
 * Lazy-creates the row on first sight.
 */
export async function getOrCreateCurrentUser(): Promise<MoboostUser | null> {
  const { userId } = await auth()
  if (!userId) return null

  const db = supabaseService()

  // 1. Try to find existing row.
  const existing = await db
    .from('users')
    .select('id, clerk_user_id, email, created_at')
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (existing.error) {
    throw new Error(`[auth] users lookup failed: ${existing.error.message}`)
  }

  if (existing.data) {
    return {
      id: existing.data.id,
      clerkUserId: existing.data.clerk_user_id,
      email: existing.data.email,
      createdAt: existing.data.created_at,
    }
  }

  // 2. Not found — hydrate from Clerk and insert.
  const clerkUser = await currentUser()
  const email =
    clerkUser?.emailAddresses?.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? null

  const inserted = await db
    .from('users')
    .insert({
      clerk_user_id: userId,
      email,
    })
    .select('id, clerk_user_id, email, created_at')
    .single()

  if (inserted.error) {
    // Race condition: another request may have created the row between
    // our lookup and insert.  Retry the lookup once.
    const retry = await db
      .from('users')
      .select('id, clerk_user_id, email, created_at')
      .eq('clerk_user_id', userId)
      .maybeSingle()
    if (retry.data) {
      return {
        id: retry.data.id,
        clerkUserId: retry.data.clerk_user_id,
        email: retry.data.email,
        createdAt: retry.data.created_at,
      }
    }
    throw new Error(`[auth] users insert failed: ${inserted.error.message}`)
  }

  return {
    id: inserted.data.id,
    clerkUserId: inserted.data.clerk_user_id,
    email: inserted.data.email,
    createdAt: inserted.data.created_at,
  }
}

/**
 * Same as `getOrCreateCurrentUser` but throws 401-style error if not
 * signed in.  Use inside route handlers that require auth.
 */
export async function requireCurrentUser(): Promise<MoboostUser> {
  const u = await getOrCreateCurrentUser()
  if (!u) throw new Error('UNAUTHENTICATED')
  return u
}

/**
 * Lightweight helper: return just the Clerk userId, or null if not signed in.
 *
 * Use this in routes that need user-scoped filesystem/cache work but don't
 * need the Supabase-side user row.  Faster than getOrCreateCurrentUser()
 * because it skips the DB round-trip.
 */
export async function getClerkUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId ?? null
}

/**
 * Same as getClerkUserId() but throws UNAUTHENTICATED if not signed in.
 * Use in API routes that must be authenticated.
 */
export async function requireClerkUserId(): Promise<string> {
  const userId = await getClerkUserId()
  if (!userId) throw new Error('UNAUTHENTICATED')
  return userId
}
