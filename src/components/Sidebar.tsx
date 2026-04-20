'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FolderKanban, Dna, Wrench, Sparkles, LogIn, User, Layout, FileText, Lightbulb } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { SignedIn, SignedOut, UserButton, SignInButton, SignUpButton, useUser } from '@clerk/nextjs'
import { store } from '@/lib/store'
import { NotificationBell } from './Notifications'
import ThemeToggle from './ThemeToggle'
import CreditBalance from './CreditBalance'
import { useLocale } from '@/lib/i18n/LocaleProvider'

const navItems = [
  { href: '/', key: 'nav.home', icon: Home },
  { href: '/inspire', key: 'nav.inspire', icon: Lightbulb },
  { href: '/project', key: 'nav.project', icon: FolderKanban },
  { href: '/reports', key: 'nav.reports', icon: FileText },
  { href: '/landing', key: 'nav.landing', icon: Layout },
  { href: '/evolution', key: 'nav.evolution', icon: Dna },
  { href: '/tools', key: 'nav.tools', icon: Wrench },
] as const

function useStoreValue<T>(selector: () => T): T {
  return useSyncExternalStore(store.subscribe, selector, selector)
}

export default function Sidebar() {
  const pathname = usePathname()
  const collapsed = useStoreValue(store.isSidebarCollapsed)
  const [hovered, setHovered] = useState(false)
  const { user } = useUser()
  const { t } = useLocale()

  // Display name priority: name → email local-part → 'Account'
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  const displayName =
    (user?.fullName && user.fullName.trim()) ||
    (primaryEmail ? primaryEmail.split('@')[0] : t('nav.account'))
  const displaySub = primaryEmail ?? t('nav.signedInAs')

  // Hide sidebar on workspace pages and auth pages — they own their own layout.
  const isWorkspace = /^\/project\/[^/]+$/.test(pathname)
  const isAuthPage =
    pathname === '/login' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/post-signin')
  if (isWorkspace || isAuthPage) return null

  const isExpanded = !collapsed || hovered

  return (
    <aside
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        fixed left-0 top-0 bottom-0 flex flex-col z-50
        transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-[240px]' : 'w-[64px]'}
      `}
      style={{
        background: 'var(--nav-bg)',
        backdropFilter: 'saturate(120%) blur(24px)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo + Theme toggle */}
      <div
        className={`px-5 py-5 flex items-center ${isExpanded ? 'justify-between' : 'justify-center px-3'}`}
        style={{
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Link href="/" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"
            style={{
              background: 'var(--brand)',
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'var(--brand-contrast)' }} />
          </div>
          {isExpanded && (
            <div className="overflow-hidden whitespace-nowrap">
              <span
                className="text-[15px] font-bold tracking-tight"
                style={{ color: 'var(--text-1)' }}
              >
                Moboost
              </span>
              <span
                className="text-[15px] font-bold tracking-tight ml-1"
                style={{ color: 'var(--brand)' }}
              >
                AI
              </span>
            </div>
          )}
        </Link>
        {isExpanded && <ThemeToggle compact />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, key, icon: Icon }) => {
          const label = t(key)
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={!isExpanded ? label : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-normal
                transition-all duration-150
                ${!isExpanded ? 'justify-center' : ''}
              `}
              style={{
                color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                borderBottom: isActive ? '2px solid var(--brand)' : 'none',
                paddingBottom: isActive ? 'calc(0.625rem - 2px)' : '0.625rem',
              }}
            >
              <Icon
                className="w-[18px] h-[18px] flex-shrink-0"
                style={{
                  color: isActive ? 'var(--brand)' : 'var(--text-3)',
                }}
              />
              {isExpanded && <span className="overflow-hidden whitespace-nowrap">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom — Credits + Notification + User */}
      <div
        className="p-3 space-y-1"
        style={{
          borderTop: '1px solid var(--border)',
        }}
      >
        {/* Credit balance pill — only renders for signed-in users
            (CreditBalance handles its own SignedIn gating). */}
        <div className={`flex ${isExpanded ? 'px-1' : 'justify-center'}`}>
          <CreditBalance collapsed={!isExpanded} />
        </div>

        {/* Notification bell */}
        <div className={`flex ${isExpanded ? 'px-1' : 'justify-center'}`}>
          <NotificationBell />
        </div>

        {/* User account — Clerk-owned */}
        <div className="relative">
          <SignedIn>
            <div
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                ${!isExpanded ? 'justify-center' : ''}
              `}
              style={{
                color: 'var(--text-1)',
              }}
            >
              {/* UserButton: avatar + click-to-open Clerk menu
                  (profile, sign out, manage accounts — all Clerk-managed) */}
              <UserButton
                afterSignOutUrl="/sign-in"
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8',
                    // Hide the "Secured by Clerk / Development mode" footer
                    // inside the popover, matching the treatment on
                    // /sign-in and /sign-up.
                    userButtonPopoverFooter: 'hidden',
                  },
                }}
              />
              {isExpanded && (
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {displayName}
                  </div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {displaySub}
                  </div>
                </div>
              )}
            </div>
          </SignedIn>

          <SignedOut>
            {/* Stacked: Sign up (primary) + Sign in (secondary).  Collapsed
                mode shows only the Sign-in avatar to save vertical space. */}
            <div className={isExpanded ? 'space-y-1.5' : ''}>
              {isExpanded && (
                <SignUpButton mode="redirect">
                  <button
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-semibold shadow-sm transition-colors"
                    style={{
                      background: 'var(--brand)',
                      color: 'var(--brand-contrast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#a8d44a'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--brand)'
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('nav.signUp')}
                  </button>
                </SignUpButton>
              )}
              <SignInButton mode="redirect">
                <button
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left
                    ${!isExpanded ? 'justify-center' : ''}
                  `}
                  style={{
                    color: 'var(--text-1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'var(--brand-light)',
                    }}
                  >
                    <User className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                  </div>
                  {isExpanded && (
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <LogIn className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
                      <span className="text-[13px] font-medium">{t('nav.signIn')}</span>
                    </div>
                  )}
                </button>
              </SignInButton>
            </div>
          </SignedOut>
        </div>
      </div>
    </aside>
  )
}
