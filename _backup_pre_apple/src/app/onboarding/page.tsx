/**
 * /onboarding — landing target after a fresh sign-up (Clerk's
 * fallbackRedirectUrl).
 *
 * Server component: lazy-creates the Supabase user row on first hit
 * and short-circuits to /project if the user has already finished
 * onboarding.  Renders the multi-step client component otherwise.
 */
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getOrCreateCurrentUser } from '@/lib/auth'
import { supabaseService } from '@/lib/db'
import OnboardingFlow from './OnboardingFlow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function OnboardingPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Lazy-create the bridged user row so the rest of the app can rely on it.
  const user = await getOrCreateCurrentUser()
  if (!user) redirect('/sign-in')

  // Idempotency gate: if the user has already finished onboarding,
  // skip the flow entirely.  This makes the page safe to bookmark
  // and safe to land on after a refresh.
  const db = supabaseService()
  const row = await db
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle()

  if (row.data?.onboarded_at) {
    redirect('/project')
  }

  return (
    <OnboardingFlow
      initialEmail={user.email ?? ''}
      bonusAmount={50}
    />
  )
}
