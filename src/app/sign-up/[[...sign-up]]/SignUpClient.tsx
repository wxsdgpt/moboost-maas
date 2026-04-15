'use client'

/**
 * SignUpClient — client-only Clerk <SignUp/> widget.
 *
 * Mirrors SignInClient: forces /onboarding redirect on success, and
 * watches `useAuth().isSignedIn` to push immediately the moment the
 * session flips on (covers the gap where Clerk's internal redirect
 * lags behind the JWT becoming valid). While bouncing we render a
 * loader so the user never sees a stale widget.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SignUp, useAuth } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'

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

  const target = safeRedirectTarget(searchParams.get('redirect_url'))

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      setBouncing(true)
      router.replace(target)
    }
  }, [isLoaded, isSignedIn, router, target])

  if (bouncing || (isLoaded && isSignedIn)) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: '#f5f5f7' }}
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#0071e3' }} />
        <div className="text-sm" style={{ color: '#555' }}>
          {t('auth.signUp.settingUp')}
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background: '#f5f5f7',
        fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div className="w-full max-w-[360px]">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <h1
            className="text-[32px] font-bold tracking-tight mb-2"
            style={{ color: '#000000' }}
          >
            {t('auth.signUp.headline')}
          </h1>
          <p className="text-[15px]" style={{ color: '#555555' }}>
            {t('auth.signUp.tagline')}
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <SignUp
            signInUrl="/sign-in"
            forceRedirectUrl={target}
            fallbackRedirectUrl={target}
            appearance={{
              variables: {
                colorBackground: '#ffffff',
                colorText: '#000000',
                colorTextSecondary: '#555555',
                colorPrimary: '#0071e3',
                colorInputBackground: '#f5f5f7',
                colorInputText: '#000000',
                colorNeutral: '#000000',
                borderRadius: '0.75rem',
                fontFamily:
                  '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
              },
              elements: {
                rootBox: 'w-full',
                card: 'border-0 shadow-none rounded-2xl',
                header: 'hidden',
                footer: 'hidden',
                logoBox: 'hidden',
                dividerLine: 'bg-gray-300',
                formFieldInput: 'bg-white border border-gray-300 rounded-lg',
                socialButtonsBlockButton:
                  'border border-gray-300 bg-white hover:bg-gray-50 text-black',
                formButtonPrimary:
                  'bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold',
                formFieldRow__firstName: 'hidden',
                formFieldRow__lastName: 'hidden',
                formFieldRow__name: 'hidden',
              },
            }}
          />
        </div>

        <p className="text-center text-[15px] mt-6" style={{ color: '#555555' }}>
          {t('auth.haveAccount')}{' '}
          <Link
            href="/sign-in"
            className="font-semibold transition-colors"
            style={{ color: '#0071e3' }}
          >
            {t('auth.signInLink')}
          </Link>
        </p>

        <p className="text-center text-[12px] mt-8" style={{ color: '#999999' }}>
          {t('auth.copyright')}
        </p>
      </div>
    </div>
  )
}
