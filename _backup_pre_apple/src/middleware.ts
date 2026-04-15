/**
 * Clerk middleware — Phase 1 PERMISSIVE mode.
 *
 * All routes are public; we just want Clerk to attach auth context to
 * every request so server components and route handlers can call
 * `auth()` and `currentUser()`.  Per-route protection (e.g. requiring
 * sign-in for /api/credits/*) will be layered on in Phase 3 via
 * `auth.protect()`.
 *
 * The file MUST live at `src/middleware.ts` (or `middleware.ts` at
 * the project root) — Clerk detects its presence by Next.js's
 * convention, not by anything in our config.
 *
 * The legacy moboost_session cookie middleware that previously lived
 * here was removed when we migrated auth to Clerk.
 */
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
}
