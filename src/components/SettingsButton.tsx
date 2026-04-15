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
import { usePathname } from 'next/navigation'
import { Settings, Check, X } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/dict'

export default function SettingsButton() {
  const pathname = usePathname() || ''
  const { locale, setLocale, t } = useLocale()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  // Hide on admin / system pages — they have their own chrome.
  if (pathname.startsWith('/admin') || pathname.startsWith('/reset')) return null

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
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
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
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            padding: 12,
            fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 4px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('settings.title')}</span>
            <button
              onClick={() => setOpen(false)}
              aria-label={t('settings.close')}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer', padding: 2, display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase' as const,
            color: 'rgba(255,255,255,0.5)',
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
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer',
        textAlign: 'left' as const,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
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
