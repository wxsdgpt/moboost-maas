'use client'

/**
 * SettingsButton — fixed bottom-left floating button that opens a small
 * settings popover. Currently houses the language switcher (English /
 * 中文); designed to be extended with future preferences without
 * rebuilding the chrome.
 *
 * Hidden on admin/auth shells via path matching so it doesn't collide
 * with their own footers.
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Settings, Check, X, LogOut } from 'lucide-react'
import { SignedIn, useClerk, useUser } from '@clerk/nextjs'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/dict'

export default function SettingsButton() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const { locale, setLocale, t } = useLocale()
  const { signOut } = useClerk()
  const { user, isSignedIn } = useUser()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      setOpen(false)
      router.push('/sign-in')
    } finally {
      setSigningOut(false)
    }
  }

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Hide on admin / system pages and pre-login flows —
  // settings (language, sign-out) only make sense inside the main app.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/reset') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/onboarding')
  ) return null

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        aria-label={t('settings.openButton')}
        title={t('settings.title')}
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: 999,
          background: 'rgba(0,0,0,0.78)',
          color: 'var(--text-1)',
          border: '1px solid var(--border-strong)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-md)',
          transition: 'transform 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        <Settings size={18} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t('settings.title')}
          style={{
            position: 'fixed',
            left: 16,
            bottom: 64,
            zIndex: 1001,
            width: 240,
            background: 'rgba(28,28,30,0.96)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-strong)',
            borderRadius: 12,
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            boxShadow: 'var(--shadow-md)',
            padding: 12,
            fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 4px 8px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('settings.title')}</span>
            <button
              onClick={() => setOpen(false)}
              aria-label={t('settings.close')}
              style={{
                background: 'none', border: 'none', color: 'var(--text-2)',
                cursor: 'pointer', padding: 2, display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase' as const,
            color: 'var(--text-3)',
            padding: '4px 6px 6px',
          }}>
            {t('settings.language')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {LOCALES.map((l) => (
              <LocaleOption
                key={l}
                value={l}
                active={l === locale}
                onSelect={() => { setLocale(l); setOpen(false) }}
              />
            ))}
          </div>

          <SignedIn>
            <div style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                textTransform: 'uppercase' as const,
                color: 'var(--text-3)',
                padding: '0 6px 6px',
              }}>
                {t('settings.account')}
              </div>
              {isSignedIn && user && (
                <div style={{
                  fontSize: 12,
                  color: 'var(--text-2)',
                  padding: '0 10px 8px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {user.primaryEmailAddress?.emailAddress || user.username || user.id}
                </div>
              )}
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  color: '#ff6b6b',
                  fontSize: 14,
                  cursor: signingOut ? 'wait' : 'pointer',
                  textAlign: 'left' as const,
                  transition: 'background 0.12s',
                  opacity: signingOut ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,107,107,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <LogOut size={14} />
                <span>{signingOut ? '...' : t('settings.signOut')}</span>
              </button>
            </div>
          </SignedIn>
        </div>
      )}
    </>
  )
}

function LocaleOption({ value, active, onSelect }: {
  value: Locale; active: boolean; onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%',
        padding: '8px 10px',
        background: active ? 'rgba(0,113,227,0.18)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        color: 'var(--text-1)',
        fontSize: 14,
        cursor: 'pointer',
        textAlign: 'left' as const,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--surface-3)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span>{LOCALE_LABELS[value]}</span>
      {active && <Check size={14} color="#2997ff" />}
    </button>
  )
}
