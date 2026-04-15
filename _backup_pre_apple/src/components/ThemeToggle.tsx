'use client'

import { Sun, Moon } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { themeStore } from '@/lib/themeStore'

// ThemeToggle — small round sun/moon button, placed next to the Moboost logo
// in the Sidebar header. Click to flip between light and dark mode.
//
// The icon shown is the icon of the theme you'll SWITCH TO (inverted):
//   currently light  → show Moon (click to go dark)
//   currently dark   → show Sun  (click to go light)
//
// This matches GitHub / Vercel / Linear conventions.

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getTheme,
    themeStore.getTheme,
  )

  const isDark = theme === 'dark'
  const Icon = isDark ? Sun : Moon
  const label = isDark ? '切换到浅色模式' : '切换到深色模式'

  return (
    <button
      type="button"
      onClick={() => themeStore.toggle()}
      title={label}
      aria-label={label}
      className={`
        flex items-center justify-center
        rounded-lg border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800
        text-gray-500 dark:text-gray-300
        hover:bg-gray-50 dark:hover:bg-gray-700
        hover:text-gray-900 dark:hover:text-white
        hover:border-gray-300 dark:hover:border-gray-600
        transition-colors duration-150
        ${compact ? 'w-7 h-7' : 'w-8 h-8'}
      `}
    >
      <Icon className="w-[14px] h-[14px]" />
    </button>
  )
}
