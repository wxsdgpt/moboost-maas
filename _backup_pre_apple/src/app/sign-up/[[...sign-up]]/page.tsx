'use client'

import Link from 'next/link'
import { SignUp } from '@clerk/nextjs'
import { Sparkles } from 'lucide-react'
import ParticleFlow from '@/components/ParticleFlow'

// Clerk v6 catch-all route: /sign-up/[[...sign-up]]/page.tsx
export default function SignUpPage() {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: '#0a0a1a' }}
    >
      <ParticleFlow focused={false} loading={false} />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(10,10,26,0) 0%, rgba(10,10,26,0.35) 55%, rgba(10,10,26,0.85) 100%)',
          zIndex: 1,
        }}
      />

      <div
        className="relative flex items-center justify-center min-h-screen px-4"
        style={{ zIndex: 2 }}
      >
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-6 animate-float-in">
            <div
              className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{
                background:
                  'linear-gradient(135deg, #22d3ee 0%, #a855f7 55%, #d946ef 100%)',
                boxShadow:
                  '0 10px 40px -8px rgba(168, 85, 247, 0.55), 0 0 24px rgba(34, 211, 238, 0.35)',
              }}
            >
              <Sparkles className="w-7 h-7 text-white drop-shadow-sm" />
            </div>
            <h1
              className="text-[28px] font-bold tracking-tight"
              style={{ color: '#F5F7FB' }}
            >
              Create your{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #22d3ee, #d946ef)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Moboost
              </span>{' '}
              account
            </h1>
            <p
              className="text-sm mt-1.5"
              style={{ color: 'rgba(245, 247, 251, 0.5)' }}
            >
              Start with 50 free credits — no card required
            </p>
          </div>

          <div className="flex justify-center animate-float-in-delay">
            <SignUp
              signInUrl="/sign-in"
              fallbackRedirectUrl="/onboarding"
              appearance={{
                variables: {
                  colorBackground: '#14162a',
                  colorText: '#F5F7FB',
                  colorTextSecondary: 'rgba(245,247,251,0.55)',
                  colorPrimary: '#22d3ee',
                  colorInputBackground: 'rgba(255,255,255,0.05)',
                  colorInputText: '#F5F7FB',
                  colorNeutral: '#F5F7FB',
                  borderRadius: '1rem',
                  fontFamily: 'inherit',
                },
                elements: {
                  rootBox: 'w-full',
                  card: 'border border-white/10 shadow-2xl',
                  header: 'hidden',
                  footer: 'hidden',
                  logoBox: 'hidden',
                  dividerLine: 'bg-white/10',
                  formFieldInput: 'bg-white/[0.05] border-white/10',
                  socialButtonsBlockButton: 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]',
                  formButtonPrimary:
                    'bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 hover:opacity-90',
                  // Hide First name / Last name rows entirely until Clerk
                  // dashboard "User model" toggle is flipped off.
                  formFieldRow__firstName: 'hidden',
                  formFieldRow__lastName: 'hidden',
                  formFieldRow__name: 'hidden',
                },
              }}
            />
          </div>

          {/* Custom sign-in link (Clerk's own footer link is hidden via
              `footer: 'hidden'` to suppress dev-mode branding). */}
          <p
            className="text-center text-sm mt-5"
            style={{ color: 'rgba(245, 247, 251, 0.6)' }}
          >
            Already have an account?{' '}
            <Link
              href="/sign-in"
              className="font-semibold transition-colors"
              style={{ color: '#22d3ee' }}
            >
              Sign in →
            </Link>
          </p>

          <p
            className="text-center text-xs mt-6"
            style={{ color: 'rgba(245, 247, 251, 0.35)' }}
          >
            © 2026 Moboost AI · iGaming Marketing Platform
          </p>
        </div>
      </div>
    </div>
  )
}
