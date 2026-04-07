import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import Notifications from '@/components/Notifications'
import MainContent from '@/components/MainContent'

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
        <Sidebar />
        <MainContent>{children}</MainContent>
        <Notifications />
      </body>
    </html>
  )
}
