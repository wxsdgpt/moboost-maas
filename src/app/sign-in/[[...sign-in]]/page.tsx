/**
 * Sign-in page — Clerk v6 catch-all route.
 *
 * This is a SERVER component. Before rendering anything, it asks Clerk on the
 * server whether the current request is already authenticated. If yes, it
 * issues a 302 redirect to the target page, so the Clerk <SignIn/> widget is
 * NEVER sent to the browser during in-app navigations. This eliminates the
 * "sign-in flash" that happened when the client had to boot Clerk's JS,
 * discover the user was already signed in, and redirect from the browser.
 *
 * Rules:
 *   - Only render <SignInClient/> if there is no active Clerk session.
 *   - Respect ?redirect_url=/foo so users land where they were heading.
 *   - Sanitise redirect target: must be a same-origin path starting with "/"
 *     to prevent open-redirect vectors.
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import SignInClient from './SignInClient'

function safeRedirectTarget(raw: string | undefined): string {
  if (!raw) return '/'
  // Only allow same-origin absolute paths. Reject protocol-relative and full URLs.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { userId } = await auth()
  const params = await searchParams

  // Already signed in — skip the sign-in UI entirely (server-side 302).
  if (userId) {
    redirect(safeRedirectTarget(params.redirect_url))
  }

  return <SignInClient />
}
