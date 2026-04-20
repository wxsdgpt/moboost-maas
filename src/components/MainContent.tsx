'use client'

import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { store } from '@/lib/store'

function useStoreValue<T>(selector: () => T): T {
  return useSyncExternalStore(store.subscribe, selector, selector)
}

export default function MainContent({ children }: { children: React.ReactNode }) {
  const collapsed = useStoreValue(store.isSidebarCollapsed)
  const pathname = usePathname()

  // Full-width pages: workspace, login, sign-in, sign-up, onboarding
  const isWorkspace = /^\/project\/[^/]+$/.test(pathname)
  const isFullWidth =
    pathname === '/login' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/post-signin')

  if (isWorkspace || isFullWidth) {
    return <main className="min-h-screen">{children}</main>
  }

  return (
    <main
      className="min-h-screen transition-all duration-300 ease-in-out"
      style={{ marginLeft: collapsed ? 64 : 240 }}
    >
      {children}
    </main>
  )
}
