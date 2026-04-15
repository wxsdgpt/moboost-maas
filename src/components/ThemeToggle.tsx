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
        rounded-lg
        bg-[#f5f5f7] dark:bg-[#1d1d1f]
        text-[#6f6f77] dark:text-[#a1a1a6]
        hover:bg-white dark:hover:bg-[#2a2a2f]
        hover:text-black dark:hover:text-white
        transition-colors duration-150
        ${compact ? 'w-7 h-7' : 'w-8 h-8'}
      `}
      style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
    >
      <Icon className="w-[14px] h-[14px]" />
    </button>
  )
}
