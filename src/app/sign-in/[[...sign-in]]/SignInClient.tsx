'use client'

/**
 * SignInClient — Dark split-screen layout with 3D globe.
 *
 * Left:  Moboost branding + Clerk <SignIn/> widget (dark themed via CSS)
 * Right: Three.js globe that morphs from wireframe sphere → full globe
 *        as the user interacts with the form fields.
 *
 * Globe stages are driven by listening to DOM focus events on Clerk's
 * rendered input fields (email → PASSWORD → submit).
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SignIn, useAuth } from '@clerk/nextjs'
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import dynamic from 'next/dynamic'
import { GLOBE_STAGE, type GlobeStage } from '@/components/LoginGlobe'

const LoginGlobe = dynamic(() => import('@/components/LoginGlobe'), { ssr: false })

const STAGE_LABELS = ['DORMANT', 'INITIALIZING', 'MAPPING', 'CONNECTING', 'ONLINE']

function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/post-signin'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/post-signin'
  return raw
}

export default function SignInClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, isSignedIn } = useAuth()
  const { t } = useLocale()
  const [bouncing, setBouncing] = useState(false)
  const [globeStage, setGlobeStage] = useState<GlobeStage>(GLOBE_STAGE.IDLE)
  const [mounted, setMounted] = useState(false)
  const [successMsg, setSuccessMsg] = useState(false)
  const clerkRef = useRef<HTMLDivElement>(null)

  const target = safeRedirectTarget(searchParams.get('redirect_url'))

  // Entrance animation trigger
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Redirect when already signed in
  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      setBouncing(true)
      setGlobeStage(GLOBE_STAGE.SUCCESS)
      setSuccessMsg(true)
      setTimeout(() => router.replace(target), 1200)
    }
  }, [isLoaded, isSignedIn, router, target])

  // Listen for focus events on Clerk's rendered inputs to drive globe stage
  const observeClerkInputs = useCallback(() => {
    const el = clerkRef.current
    if (!el) return

    const handler = () => {
      const active = document.activeElement
      if (!active || !el.contains(active)) {
        // Nothing focused inside Clerk — idle (but stay at PASSWORD if
        // we've progressed that far and inputs have values)
        setTimeout(() => {
          if (!el.contains(document.activeElement)) {
            const inputs = el.querySelectorAll('input')
            const hasPassword = Array.from(inputs).some(
              i => i.type === 'password' && i.value
            )
            const hasEmail = Array.from(inputs).some(
              i => (i.type === 'email' || i.type === 'text') && i.value
            )
            if (hasPassword) setGlobeStage(GLOBE_STAGE.PASSWORD)
            else if (hasEmail) setGlobeStage(GLOBE_STAGE.EMAIL)
            else setGlobeStage(GLOBE_STAGE.IDLE)
          }
        }, 100)
        return
      }

      const tag = active.tagName.toLowerCase()
      if (tag !== 'input' && tag !== 'textarea') return

      const input = active as HTMLInputElement
      if (input.type === 'password') {
        setGlobeStage(GLOBE_STAGE.PASSWORD)
      } else {
        setGlobeStage(GLOBE_STAGE.EMAIL)
      }
    }

    // Also detect form submission (Clerk's button click)
    const clickHandler = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.closest('button[type="submit"], .cl-formButtonPrimary')) {
        setGlobeStage(GLOBE_STAGE.LOADING)
      }
    }

    el.addEventListener('focusin', handler)
    el.addEventListener('focusout', handler)
    el.addEventListener('click', clickHandler)

    return () => {
      el.removeEventListener('focusin', handler)
      el.removeEventListener('focusout', handler)
      el.removeEventListener('click', clickHandler)
    }
  }, [])

  // Re-observe when Clerk finishes rendering (it renders asynchronously)
  useEffect(() => {
    const timer = setInterval(() => {
      const el = clerkRef.current
      if (el && el.querySelector('input')) {
        clearInterval(timer)
        observeClerkInputs()
      }
    }, 200)
    return () => clearInterval(timer)
  }, [observeClerkInputs])

  // Bouncing / already signed in → animated success
  if (bouncing || (isLoaded && isSignedIn)) {
    return (
      <div className="auth-split">
        <div className="auth-left" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="flex flex-col items-center gap-4"
            style={{
              animation: 'auth-success-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            {successMsg ? (
              <>
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'rgba(192,228,99,0.1)',
                    animation: 'auth-check-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  }}
                >
                  <CheckCircle2 className="w-8 h-8" style={{ color: '#c0e463' }} />
                </div>
                <div className="text-lg font-semibold" style={{ color: '#ffffff' }}>
                  Welcome back
                </div>
                <div className="text-sm" style={{ color: 'rgba(255,255,255,.4)' }}>
                  {t('auth.signedIn.checking')}
                </div>
              </>
            ) : (
              <>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#c0e463' }} />
                <div className="text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>
                  {t('auth.signedIn.checking')}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="auth-right">
          <LoginGlobe stage={GLOBE_STAGE.SUCCESS} />
        </div>
      </div>
    )
  }

  return (
    <div className="auth-split">
      {/* ─── LEFT: Form with staggered entrance ─── */}
      <div className="auth-left">
        {/* Logo — stagger 0 */}
        <div
          className="auth-logo auth-stagger"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transitionDelay: '0ms',
          }}
        >
          <div className="auth-logo-mark">
            <Sparkles className="w-4 h-4" style={{ color: '#000' }} />
          </div>
          <span className="auth-logo-text">MOBOOST</span>
        </div>

        {/* Title — stagger 1 */}
        <h1
          className="auth-title auth-stagger"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transitionDelay: '80ms',
          }}
        >
          Welcome back
        </h1>

        {/* Subtitle — stagger 2 */}
        <p
          className="auth-subtitle auth-stagger"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transitionDelay: '160ms',
          }}
        >
          Sign in to your AI marketing workspace.
        </p>

        {/* Clerk widget — stagger 3 */}
        <div
          className="auth-clerk-wrapper auth-stagger"
          ref={clerkRef}
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transitionDelay: '260ms',
          }}
        >
          <SignIn
            signUpUrl="/sign-up"
            forceRedirectUrl={target}
            fallbackRedirectUrl={target}
            appearance={{
              variables: {
                colorBackground: 'transparent',
                colorText: '#ffffff',
                colorTextSecondary: 'rgba(255,255,255,.5)',
                colorPrimary: '#c0e463',
                colorInputBackground: 'rgba(255,255,255,.04)',
                colorInputText: '#ffffff',
                colorNeutral: '#ffffff',
                borderRadius: '0.75rem',
                fontFamily: 'inherit',
              },
              elements: {
                rootBox: 'w-full',
                card: 'border-0 shadow-none bg-transparent p-0',
                header: 'hidden',
                footer: 'hidden',
                logoBox: 'hidden',
              },
            }}
          />
        </div>

        {/* Sign up link — stagger 4 */}
        <p
          className="auth-footer-link auth-stagger"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            transitionDelay: '360ms',
          }}
        >
          {t('auth.noAccount')}{' '}
          <Link href="/sign-up">{t('auth.signUpLink')}</Link>
        </p>

        {/* Bottom phase indicator — stagger 5 */}
        <div
          className="absolute bottom-10 left-[52px] flex items-center gap-2 auth-stagger"
          style={{
            fontFamily: '"DM Mono", "SF Mono", monospace',
            fontSize: 11,
            letterSpacing: '.15em',
            color: 'rgba(192,228,99,.5)',
            opacity: mounted ? 1 : 0,
            transitionDelay: '500ms',
          }}
        >
          <div className="auth-phase-dot" />
          STAGE {String(globeStage + 1).padStart(2, '0')} — {STAGE_LABELS[globeStage]}
        </div>
      </div>

      {/* ─── RIGHT: 3D Globe ─── */}
      <div className="auth-right">
        <LoginGlobe stage={globeStage} />

        {/* Coordinate overlays */}
        <span className="auth-coord-label" style={{ top: 20, left: 20 }}>
          47.3769° N<br />8.5417° E
        </span>
        <span className="auth-coord-label" style={{ top: 20, right: 20, textAlign: 'right' }}>
          ORBITAL GENESIS<br />v1.0.2
        </span>
        <div
          className="auth-stage-label"
          style={{ color: globeStage >= 3 ? 'rgba(192,228,99,.6)' : undefined }}
        >
          STAGE {String(globeStage + 1).padStart(2, '0')} — {STAGE_LABELS[globeStage]}
        </div>
      </div>
    </div>
  )
}
