/**
 * /post-signin — Clerk's fallbackRedirectUrl after a successful sign-in.
 *
 * 1. Checks /api/me to see if the user has completed onboarding.
 * 2. If NOT onboarded → redirect to /onboarding.
 * 3. If onboarded → read `moboost:lastPath` from localStorage and
 *    bounce back to where they left off (falls back to `/`).
 */
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import ParticleFlow from '@/components/ParticleFlow'

const STORAGE_KEY = 'moboost:lastPath'

function isSafePath(p: unknown): p is string {
  return (
    typeof p === 'string' &&
    p.length > 0 &&
    p.length < 2048 &&
    p.startsWith('/') &&
    !p.startsWith('//')
  )
}

export default function PostSignInPage() {
  const router = useRouter()

  useEffect(() => {
    ;(async () => {
      let target = '/'

      try {
        // Check if user has completed onboarding
        const res = await fetch('/api/me', {
          credentials: 'same-origin',
          cache: 'no-store',
        })

        if (res.ok) {
          const data = await res.json()

          if (data.ok && !data.onboardedAt) {
            // User exists but hasn't onboarded — send to onboarding
            router.replace('/onboarding')
            return
          }
        }
      } catch {
        // If /api/me fails, fall through to default redirect
      }

      // User is onboarded — redirect to last path or home
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (isSafePath(stored)) target = stored
      } catch {
        // ignore
      }

      router.replace(target)
    })()
  }, [router])

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      style={{ background: '#0a0a1a' }}
    >
      <ParticleFlow focused={false} loading={true} />
      <div
        className="relative flex flex-col items-center gap-3"
        style={{ zIndex: 2, color: '#F5F7FB' }}
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#22d3ee' }} />
        <div className="text-sm" style={{ color: 'rgba(245,247,251,0.6)' }}>
          Signing you back in…
        </div>
      </div>
    </div>
  )
}
