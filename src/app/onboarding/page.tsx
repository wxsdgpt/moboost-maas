/**
 * /onboarding — landing target after a fresh sign-up (Clerk's
 * fallbackRedirectUrl).
 *
 * Server component: lazy-creates the Supabase user row on first hit
 * and short-circuits to /project if the user has already finished
 * onboarding.  Renders the multi-step client component otherwise.
 *
 * A/B test: reads `onboarding_variant` from admin_config to determine
 * which onboarding flow to show ('form' | 'chat' | 'hybrid').
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

  const db = supabaseService()

  // Idempotency gate: if the user has already finished onboarding,
  // skip the flow entirely.
  const { data, error } = await db
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[onboarding] Failed to check onboarding status:', error.message)
    redirect('/sign-in')
  }

  if (data?.onboarded_at) {
    redirect('/')
  }

  // Read A/B test variant from admin_config
  let variant: 'form' | 'chat' | 'hybrid' = 'form'
  try {
    const { data: config } = await db
      .from('admin_config')
      .select('value')
      .eq('key', 'onboarding_variant')
      .maybeSingle()

    if (config?.value) {
      const v = typeof config.value === 'string' ? config.value : String(config.value)
      if (v === 'chat' || v === 'hybrid' || v === 'form') {
        variant = v
      }
    }
  } catch {
    // Fall back to 'form' on any error
  }

  return (
    <OnboardingFlow
      initialEmail={user.email ?? ''}
      bonusAmount={50}
      variant={variant}
    />
  )
}
