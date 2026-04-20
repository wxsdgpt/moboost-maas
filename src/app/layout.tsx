import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { headers } from 'next/headers'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import Notifications from '@/components/Notifications'
import MainContent from '@/components/MainContent'
import ThemeProvider from '@/components/ThemeProvider'
import UserScopeGuard from '@/components/UserScopeGuard'
import LastPathTracker from '@/components/LastPathTracker'
import SettingsButton from '@/components/SettingsButton'
import AuthBypassBanner from '@/components/AuthBypassBanner'
import { AUTH_BYPASS } from '@/lib/authBypass'
import { LocaleProvider } from '@/lib/i18n/LocaleProvider'

export const metadata: Metadata = {
  title: 'Moboost AI — MAAS Platform',
  description: 'Marketing-as-a-Service for iGaming',
  themeColor: '#000000',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Moboost AI',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Middleware injects x-pathname so we can detect admin routes reliably.
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/reset')

  return (
    <html
      lang="en"
      data-theme="dark"
      className={`scroll-smooth${AUTH_BYPASS ? ' auth-bypass-on' : ''}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          @supports (font-variation-settings: normal) {
            body { font-family: -apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif; }
          }
        ` }} />
      </head>
      <body className="antialiased bg-white text-apple-near-black dark:bg-black dark:text-white">
        <AuthBypassBanner />
        {isAdminRoute ? (
          /* Admin: bare layout — no Clerk/Sidebar/UserScopeGuard
             so data reset won't trigger auto user re-creation */
          <>{children}</>
        ) : (
          <ClerkProvider>
            <UserScopeGuard />
            <LastPathTracker />
            <LocaleProvider>
              <ThemeProvider>
                <Sidebar />
                <MainContent>{children}</MainContent>
                <Notifications />
                <SettingsButton />
              </ThemeProvider>
            </LocaleProvider>
          </ClerkProvider>
        )}
      </body>
    </html>
  )
}
