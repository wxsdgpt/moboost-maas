'use client'

// ─────────────────────────────────────────────────────────────────────────────
// themeStore — light/dark mode with localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────
// Pattern matches src/lib/store.ts: a tiny useSyncExternalStore-backed store
// with a single `theme` field and subscribe/notify. Read on client only.
//
// Persistence: localStorage key `moboost-theme` holds 'light' | 'dark'. On
// first mount, if there's no saved value, we fall back to the system
// preference (prefers-color-scheme: dark). The store itself is SSR-safe —
// default is 'light' during SSR, hydration happens on the client in
// ThemeProvider after mount, so there's no server/client class mismatch.
//
// The actual DOM mutation (adding/removing `.dark` on <html>) lives in
// ThemeProvider, not here — keep the store pure.
// ─────────────────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'moboost-theme'

let _theme: Theme = 'light'
let _hydrated = false
const _listeners = new Set<() => void>()

function _notify() {
  _listeners.forEach((fn) => fn())
}

function _readFromStorage(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    // No saved preference — use system
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
    // localStorage blocked (private mode) — silently fall back
  }
  return 'light'
}

function _writeToStorage(t: Theme) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, t)
  } catch {
    // swallow — persistence is best-effort
  }
}

export const themeStore = {
  subscribe(listener: () => void) {
    _listeners.add(listener)
    return () => {
      _listeners.delete(listener)
    }
  },

  // Selector for useSyncExternalStore
  getTheme(): Theme {
    return _theme
  },

  // Called once by ThemeProvider on first client mount
  hydrate() {
    if (_hydrated) return
    _hydrated = true
    const t = _readFromStorage()
    if (t !== _theme) {
      _theme = t
      _notify()
    }
  },

  setTheme(t: Theme) {
    if (t === _theme) return
    _theme = t
    _writeToStorage(t)
    _notify()
  },

  toggle() {
    this.setTheme(_theme === 'light' ? 'dark' : 'light')
  },

  isHydrated() {
    return _hydrated
  },
}
