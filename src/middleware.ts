/**
 * Clerk middleware — Auth + Onboarding enforcement.
 *
 * Auth strategy (Clerk v6 recommended pattern):
 *   - PAGE routes: middleware enforces auth, redirects to /sign-in
 *   - API routes:  middleware passes through, each handler checks auth
 *     via auth() from @clerk/nextjs/server. This avoids JWT token-refresh
 *     timing issues that cause spurious 401s in middleware.
 *
 * Public routes (no login required):
 *   - /sign-in, /sign-up (auth pages)
 *   - /admin/*, /reset (admin tools)
 *   - /api/* (handlers check auth themselves)
 *
 * Onboarding gate:
 *   Authenticated users who haven't completed onboarding are
 *   redirected to /onboarding for all page navigations.
 *
 * Also injects x-pathname header for server components.
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Routes that don't require authentication at the middleware level.
// API routes are public here because each route handler checks auth itself
// via auth() from @clerk/nextjs/server — this is the Clerk v6 recommended
// pattern and avoids JWT token-refresh timing issues in middleware.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/admin(.*)',
  '/reset(.*)',
  '/api/(.*)',          // all API routes — handlers check auth themselves
  '/test/(.*)',         // /test/* harness pages (preview, video) for QA
])

// Routes that skip the onboarding check (already authenticated)
const skipOnboardingCheck = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/admin(.*)',
  '/reset(.*)',
  '/api/(.*)',           // all API routes — let them handle their own logic
  '/test/(.*)',          // test harness pages
  '/onboarding(.*)',     // onboarding page itself
  '/post-signin(.*)',    // post-signin handles its own redirect
])

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname

  // Inject pathname header for layout detection
  const res = NextResponse.next()
  res.headers.set('x-pathname', pathname)

  // If not a public route, enforce auth
  if (!isPublicRoute(req)) {
    let userId: string | null = null
    try {
      const authResult = await auth()
      userId = authResult.userId
    } catch (authErr) {
      console.error(`[middleware] auth() threw for ${pathname}:`, authErr)
    }

    if (!userId) {
      console.warn(`[middleware] NO userId for ${pathname} — rejecting`)

      // API routes: return JSON 401 (don't redirect to HTML sign-in page)
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'unauthenticated', message: 'Session expired. Please sign in again.' },
          { status: 401 },
        )
      }

      // Page routes: redirect to sign-in with full return URL
      const signInUrl = new URL('/sign-in', req.url)
      const fullPath = req.nextUrl.search
        ? `${pathname}${req.nextUrl.search}`
        : pathname
      signInUrl.searchParams.set('redirect_url', fullPath)
      return NextResponse.redirect(signInUrl)
    }

    // ── Onboarding gate ──
    // For authenticated page navigations, check if user has completed onboarding.
    // Uses a cookie cache to avoid a DB call on every request.
    if (!skipOnboardingCheck(req)) {
      const onboardedCookie = req.cookies.get('moboost:onboarded')?.value

      if (onboardedCookie !== '1') {
        // No cookie — check Supabase
        try {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          )
          const { data } = await supabase
            .from('users')
            .select('onboarded_at')
            .eq('clerk_user_id', userId)
            .maybeSingle()

          if (!data || !data.onboarded_at) {
            // Not onboarded — redirect
            console.warn(`[middleware] user ${userId} not onboarded — redirecting to /onboarding`)
            return NextResponse.redirect(new URL('/onboarding', req.url))
          }

          // Onboarded — set cookie so we skip the DB check next time
          res.cookies.set('moboost:onboarded', '1', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24, // 24 hours — re-verify daily
            path: '/',
          })
        } catch (e) {
          // If DB check fails, let the request through — don't block the user
          console.error('[middleware] onboarding check failed:', e)
        }
      }
    }
  }

  return res
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
