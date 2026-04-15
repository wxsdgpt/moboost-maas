/**
 * Sign-up page — Clerk v6 catch-all route.
 *
 * Server component: short-circuits with a 302 to /onboarding (or the
 * sanitised redirect target) when the request already carries a Clerk
 * session, so an authenticated user never sees the sign-up widget flash.
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import SignUpClient from './SignUpClient'

function safeRedirectTarget(raw: string | undefined): string {
  if (!raw) return '/onboarding'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/onboarding'
  return raw
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { userId } = await auth()
  const params = await searchParams

  if (userId) {
    redirect(safeRedirectTarget(params.redirect_url))
  }

  return <SignUpClient />
}
