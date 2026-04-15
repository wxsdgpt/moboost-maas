'use client'

/**
 * UserScopeGuard — Phase 1.5 per-user data isolation
 * ============================================================================
 *
 * Watches the Clerk `user` object and keeps the in-memory store synced to
 * exactly one identity at a time.
 *
 * Why this exists:
 *   Before Phase 1.5 the store was hydrated once per browser session from a
 *   shared <DATA_DIR>/projects folder, so User A's projects leaked straight
 *   into User B's UI whenever they switched accounts on the same machine.
 *
 * What this does:
 *   - On first mount of a signed-in user  → store.hydrate()
 *   - On sign-out                         → store.reset()
 *   - On user change (A → B)              → store.reset() then store.hydrate()
 *   - On transition signed-out → signed-in → store.reset() (just in case)
 *                                           then store.hydrate()
 *
 * This is a pure side-effect component.  It renders nothing.
 *
 * Placement: inside <ClerkProvider>, outside (or alongside) <ThemeProvider>
 * in src/app/layout.tsx.  It must be a client component because useUser()
 * only works in the browser.
 */
import { useEffect, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { store } from '@/lib/store'

export default function UserScopeGuard() {
  const { isLoaded, isSignedIn, user } = useUser()
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Wait for Clerk to report a definitive state before touching the store.
    if (!isLoaded) return

    const currentId = isSignedIn && user ? user.id : null
    const previousId = lastUserIdRef.current

    if (currentId === previousId) return // no change, nothing to do
    lastUserIdRef.current = currentId

    // Any transition requires a clean slate first.
    store.reset()

    // Also drop the LastPathTracker breadcrumb so the next sign-in on
    // this device doesn't bounce a different user back to the prior
    // user's last page.  Belongs here (next to store.reset) because
    // both fix the same class of bug: residual state from the
    // previous identity leaking into the next one.
    try {
      window.localStorage.removeItem('moboost:lastPath')
    } catch {
      // localStorage may be disabled (private mode); ignore.
    }

    if (currentId) {
      // Signed in — pull this user's projects from the server.
      store.hydrate().catch((err) => {
        console.warn('[UserScopeGuard] hydrate failed after user change:', err)
      })
    }
    // If currentId is null we're signed out; reset() already cleared
    // everything, so just leave the store empty.
  }, [isLoaded, isSignedIn, user])

  return null
}
