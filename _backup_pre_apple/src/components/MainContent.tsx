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

  // Workspace pages (/project/[id]) and login page use their own full-width layout
  const isWorkspace = /^\/project\/[^/]+$/.test(pathname)
  const isLogin = pathname === '/login'

  if (isWorkspace || isLogin) {
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
