/**
 * /post-signin — Clerk's fallbackRedirectUrl after a successful
 * sign-in.  Reads `moboost:lastPath` from localStorage (set by
 * LastPathTracker on every navigation while signed in) and bounces
 * the user back to where they left off.  Falls back to `/` if there
 * is no recorded path or storage is unavailable.
 *
 * Must be a client component because the value lives in localStorage,
 * which is not accessible during server rendering.
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
    // Block protocol-relative URLs (//evil.com) which would be
    // treated as cross-origin by router.replace.
    !p.startsWith('//')
  )
}

export default function PostSignInPage() {
  const router = useRouter()

  useEffect(() => {
    let target = '/'
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isSafePath(stored)) target = stored
    } catch {
      // ignore
    }
    router.replace(target)
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
