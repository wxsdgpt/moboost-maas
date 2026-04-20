'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { themeStore } from '@/lib/themeStore'

// ThemeProvider — syncs the themeStore value to a `.dark` class on <html>.
// Rules:
//   1. Hydrate once on mount (reads localStorage or system preference)
//   2. On every theme change, toggle `.dark` on documentElement
//   3. Login page is excluded: on /login, we FORCE light by removing `.dark`
//      regardless of saved preference, so the branded login stays light
//   4. Never renders anything — pure side-effect component
//
// SSR safety: the initial HTML is rendered without `.dark` (default light).
// On the client, this component hydrates the store and re-applies the
// correct class on first render. There's a tiny flash-of-light possible
// if a user prefers dark mode and refreshes a non-login page; we accept
// this trade-off to keep the server output deterministic and avoid
// injecting a blocking inline script.

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getTheme,
    themeStore.getTheme,
  )

  // 1) Hydrate on first mount
  useEffect(() => {
    themeStore.hydrate()
  }, [])

  // 2) Apply class on every theme or pathname change
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement

    if (theme === 'dark') {
      el.classList.add('dark')
      el.setAttribute('data-theme', 'dark')
    } else {
      el.classList.remove('dark')
      el.setAttribute('data-theme', 'light')
    }
  }, [theme, pathname])

  return <>{children}</>
}
