/**
 * Auth bypass flag — v1.0.2 test mode
 * ====================================
 *
 * When `AUTH_BYPASS=1` is set in the environment, ALL authentication checks
 * are short-circuited and every request is treated as an authenticated
 * "dev" user. This exists solely so QA can click through the product
 * without needing valid Clerk sessions or admin credentials.
 *
 * ⚠️ DO NOT enable in production. A visible red banner is shown in the UI
 *    whenever this flag is active.
 *
 * Toggle:
 *   AUTH_BYPASS=1   → bypass on
 *   (unset / 0)     → normal auth
 *
 * NEXT_PUBLIC_AUTH_BYPASS mirrors the same value so client components
 * (e.g. the warning banner) can see it.
 */

export const AUTH_BYPASS =
  process.env.AUTH_BYPASS === '1' ||
  process.env.AUTH_BYPASS === 'true' ||
  process.env.NEXT_PUBLIC_AUTH_BYPASS === '1' ||
  process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true'

/** Synthetic user id used everywhere an authenticated userId is expected. */
export const BYPASS_USER_ID = 'user_bypass_dev'
export const BYPASS_USER_EMAIL = 'dev@moboost.local'

/**
 * Wrap a Clerk `auth()` result — when bypass is on, always returns a
 * synthetic userId. Used by API route handlers to stay authed during QA.
 */
export async function resolveClerkUserId(
  clerkAuth: () => Promise<{ userId: string | null }>,
): Promise<string | null> {
  if (AUTH_BYPASS) return BYPASS_USER_ID
  try {
    const { userId } = await clerkAuth()
    return userId
  } catch {
    return null
  }
}
