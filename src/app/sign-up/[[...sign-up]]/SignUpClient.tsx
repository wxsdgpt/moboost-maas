'use client'

/**
 * SignUpClient — Dark split-screen with 3D globe + full entrance animations.
 *
 * Left:  Moboost branding + Clerk <SignUp/> widget with staggered fade-in
 * Right: Three.js globe that morphs as user interacts with the form
 *
 * Animations: logo → title → subtitle → form → footer stagger in on mount,
 * success state plays a zoom + fade transition before redirect.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SignUp, useAuth } from '@clerk/nextjs'
import { Loader2, Sparkles, CheckCircle2, Ticket, ArrowRight, ShieldCheck } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import dynamic from 'next/dynamic'
import { GLOBE_STAGE, type GlobeStage } from '@/components/LoginGlobe'

const LoginGlobe = dynamic(() => import('@/components/LoginGlobe'), { ssr: false })

const STAGE_LABELS = ['DORMANT', 'INITIALIZING', 'MAPPING', 'CONNECTING', 'ONLINE']

/** Valid invite codes — checked client-side for now */
const VALID_INVITE_CODES = ['mb0401']

function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/onboarding'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/onboarding'
  return raw
}

export default function SignUpClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, isSignedIn } = useAuth()
  const { t } = useLocale()
  const [bouncing, setBouncing] = useState(false)
  const [globeStage, setGlobeStage] = useState<GlobeStage>(GLOBE_STAGE.IDLE)
  const [mounted, setMounted] = useState(false)
  const [successMsg, setSuccessMsg] = useState(false)
  const clerkRef = useRef<HTMLDivElement>(null)

  // Invite code gate state
  const [inviteCode, setInviteCode] = useState('')
  const [inviteVerified, setInviteVerified] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteShake, setInviteShake] = useState(false)

  const target = safeRedirectTarget(searchParams.get('redirect_url'))

  // Entrance animation trigger
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      setBouncing(true)
      setGlobeStage(GLOBE_STAGE.SUCCESS)
      setSuccessMsg(true)
      setTimeout(() => router.replace(target), 1200)
    }
  }, [isLoaded, isSignedIn, router, target])

  // Observe Clerk inputs to drive globe stages
  const observeClerkInputs = useCallback(() => {
    const el = clerkRef.current
    if (!el) return

    const handler = () => {
      const active = document.activeElement
      if (!active || !el.contains(active)) {
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

  // Success / bouncing state — animated transition
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
                  {t('auth.signUp.settingUp')}
                </div>
                <div className="text-sm" style={{ color: 'rgba(255,255,255,.4)' }}>
                  Preparing your workspace…
                </div>
              </>
            ) : (
              <>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#c0e463' }} />
                <div className="text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>
                  {t('auth.signUp.settingUp')}
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

  // ── Invite code verification handler ──
  const handleInviteSubmit = () => {
    const code = inviteCode.trim().toLowerCase()
    if (!code) {
      setInviteError('Please enter an invitation code')
      setInviteShake(true)
      setTimeout(() => setInviteShake(false), 600)
      return
    }
    if (!VALID_INVITE_CODES.includes(code)) {
      setInviteError('Invalid invitation code')
      setInviteShake(true)
      setTimeout(() => setInviteShake(false), 600)
      return
    }
    setInviteError('')
    setInviteVerified(true)
  }

  return (
    <div className="auth-split">
      {/* ─── LEFT: Form ─── */}
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
          {t('auth.signUp.headline')}
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
          {t('auth.signUp.tagline')}
        </p>

        {/* Clerk form — stagger 3, disabled until invite verified */}
        <div
          className="auth-clerk-wrapper auth-stagger"
          ref={clerkRef}
          style={{
            opacity: mounted ? (inviteVerified ? 1 : 0.35) : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transitionDelay: '260ms',
            pointerEvents: inviteVerified ? 'auto' : 'none',
            filter: inviteVerified ? 'none' : 'grayscale(0.5)',
            transition: 'opacity .4s, transform .5s, filter .4s',
            position: 'relative',
          }}
        >
          <SignUp
            signInUrl="/sign-in"
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
                formFieldRow__firstName: 'hidden',
                formFieldRow__lastName: 'hidden',
                formFieldRow__name: 'hidden',
              },
            }}
          />
        </div>

        {/* ── Invite code field — below Clerk form ── */}
        <div
          className="auth-stagger"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transitionDelay: '340ms',
            width: '100%',
            maxWidth: 400,
            marginTop: 6,
          }}
        >
          {inviteVerified ? (
            /* Verified state — compact green badge */
            <div
              className="flex items-center gap-2"
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                background: 'rgba(192,228,99,0.08)',
                border: '1px solid rgba(192,228,99,0.2)',
              }}
            >
              <ShieldCheck className="w-4 h-4" style={{ color: '#c0e463' }} />
              <span style={{ fontSize: 13, color: '#c0e463', fontWeight: 500 }}>
                Invitation verified
              </span>
            </div>
          ) : (
            <>
              {/* Label */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase' as const,
                  color: 'rgba(255,255,255,.5)',
                  marginBottom: 8,
                }}
              >
                <Ticket className="w-3.5 h-3.5" style={{ color: '#c0e463' }} />
                Invitation Code
              </label>

              {/* Input + verify button */}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  animation: inviteShake ? 'auth-shake 0.5s ease-in-out' : undefined,
                }}
              >
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value)
                    if (inviteError) setInviteError('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleInviteSubmit()}
                  placeholder="Enter your invite code"
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,.04)',
                    border: `1px solid ${inviteError ? 'rgba(255,100,100,.4)' : 'rgba(255,255,255,.08)'}`,
                    borderRadius: 12,
                    padding: '13px 14px',
                    color: '#ffffff',
                    fontSize: 15,
                    outline: 'none',
                    transition: 'border-color .3s, box-shadow .3s',
                    fontFamily: 'inherit',
                  }}
                  onFocus={(e) => {
                    if (!inviteError) {
                      e.currentTarget.style.borderColor = 'rgba(192,228,99,.35)'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(192,228,99,.08)'
                    }
                  }}
                  onBlur={(e) => {
                    if (!inviteError) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleInviteSubmit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: '#c0e463',
                    color: '#000000',
                    border: 'none',
                    borderRadius: 999,
                    padding: '0 22px',
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: '.03em',
                    cursor: 'pointer',
                    transition: 'transform .2s, box-shadow .3s',
                    boxShadow: '0 4px 24px rgba(192,228,99,.2)',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 8px 40px rgba(192,228,99,.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 24px rgba(192,228,99,.2)'
                  }}
                >
                  Verify
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Error */}
              {inviteError && (
                <p style={{ color: '#ff6b6b', fontSize: 13, marginTop: 8 }}>
                  {inviteError}
                </p>
              )}

              {/* Hint */}
              <p style={{ color: 'rgba(255,255,255,.25)', fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
                Enter your invitation code to unlock registration.
              </p>
            </>
          )}
        </div>

        {/* Footer link — stagger 4 */}
        <p
          className="auth-footer-link auth-stagger"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            transitionDelay: '400ms',
          }}
        >
          {t('auth.haveAccount')}{' '}
          <Link href="/sign-in">{t('auth.signInLink')}</Link>
        </p>

        {/* Stage indicator — stagger 5 */}
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
