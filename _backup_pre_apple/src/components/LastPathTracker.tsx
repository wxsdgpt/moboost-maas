'use client'

/**
 * LastPathTracker — remembers the last "real" page the signed-in user
 * was looking at, so that next time they land on /post-signin we can
 * bounce them back where they were instead of always dumping them on
 * /project.
 *
 * Storage:
 *   localStorage['moboost:lastPath']  → string | absent
 *
 * Why localStorage and not a cookie:
 *   - We don't want this leaking into server requests
 *   - We don't want it shared across browsers (per-device "where I left off")
 *   - We don't need it to survive the user clearing their site data
 *
 * Skipped paths (we never want to bounce a user back into one of these):
 *   - /sign-in / /sign-up  — auth shells
 *   - /onboarding          — first-run flow
 *   - /post-signin         — the redirect target itself
 *   - /login               — legacy auth route
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

const STORAGE_KEY = 'moboost:lastPath'

const SKIP_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/onboarding',
  '/post-signin',
  '/login',
]

function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
}

export default function LastPathTracker() {
  const pathname = usePathname()
  const { isLoaded, isSignedIn } = useUser()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (!pathname) return
    if (shouldSkip(pathname)) return
    try {
      window.localStorage.setItem(STORAGE_KEY, pathname)
    } catch {
      // localStorage may be disabled (private mode); ignore.
    }
  }, [pathname, isLoaded, isSignedIn])

  return null
}
