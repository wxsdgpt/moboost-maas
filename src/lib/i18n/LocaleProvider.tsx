'use client'

/**
 * LocaleProvider — global i18n state.
 *
 * Default is English (per product spec). User's choice is persisted to
 * localStorage under `moboost.locale` so it survives reloads, and broadcast
 * via a CustomEvent so non-React listeners (e.g. third-party widgets that
 * mount their own roots) can react.
 *
 * Usage:
 *   const { t, locale, setLocale } = useLocale()
 *   <h1>{t('auth.signIn.title')}</h1>
 *
 * Missing keys fall back to English; if both are missing the key itself is
 * returned, which makes gaps obvious in the UI rather than rendering empty
 * strings.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { dictionaries, DEFAULT_LOCALE, type Locale } from './dict'

const STORAGE_KEY = 'moboost.locale'
const EVENT_NAME = 'moboost:locale-change'

type LocaleContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Always start at the default to avoid SSR/CSR hydration mismatch.
  // The client effect below promotes the persisted choice on first paint.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null
      if (stored && (stored === 'en' || stored === 'zh') && stored !== locale) {
        setLocaleState(stored)
      }
    } catch {
      // Privacy mode / disabled storage — ignore.
    }

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Locale>).detail
      if (next && next !== locale) setLocaleState(next)
    }
    window.addEventListener(EVENT_NAME, onChange)
    return () => window.removeEventListener(EVENT_NAME, onChange)
  // We intentionally only sync from storage once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch { /* ignore */ }
    try {
      // Reflect on <html lang="…"> for accessibility + 3rd-party CSS hooks.
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
    } catch { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent<Locale>(EVENT_NAME, { detail: next }))
    } catch { /* ignore */ }
  }, [])

  const t = useCallback((key: string): string => {
    const primary = dictionaries[locale]?.[key]
    if (primary) return primary
    const fallback = dictionaries[DEFAULT_LOCALE]?.[key]
    return fallback ?? key
  }, [locale])

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    // Permissive fallback — pages that haven't been wrapped still render,
    // they just always see English. Loud in dev, silent in prod.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('useLocale called outside LocaleProvider — falling back to English')
    }
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => { /* no-op */ },
      t: (key: string) => dictionaries[DEFAULT_LOCALE]?.[key] ?? key,
    }
  }
  return ctx
}
