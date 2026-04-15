import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import Notifications from '@/components/Notifications'
import MainContent from '@/components/MainContent'
import ThemeProvider from '@/components/ThemeProvider'
import UserScopeGuard from '@/components/UserScopeGuard'
import LastPathTracker from '@/components/LastPathTracker'

export const metadata: Metadata = {
  title: 'Moboost AI — MAAS Platform',
  description: 'Marketing-as-a-Service for iGaming',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* ClerkProvider must be inside <body> per Clerk v6 App Router docs.
            ThemeProvider sits inside so Clerk context is available everywhere,
            including any future theme-aware auth UI. */}
        <ClerkProvider>
          {/* UserScopeGuard: resets + rehydrates the store whenever the
              signed-in Clerk identity changes.  Must live inside
              <ClerkProvider> so useUser() works. */}
          <UserScopeGuard />
          {/* LastPathTracker: records pathname to localStorage on every
              signed-in navigation so /post-signin can bounce returning
              users back to where they left off. */}
          <LastPathTracker />
          <ThemeProvider>
            <Sidebar />
            <MainContent>{children}</MainContent>
            <Notifications />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
