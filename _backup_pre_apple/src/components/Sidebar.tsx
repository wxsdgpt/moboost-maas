'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FolderKanban, Dna, Wrench, Sparkles, LogIn, User, Layout } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { SignedIn, SignedOut, UserButton, SignInButton, SignUpButton, useUser } from '@clerk/nextjs'
import { store } from '@/lib/store'
import { NotificationBell } from './Notifications'
import ThemeToggle from './ThemeToggle'
import CreditBalance from './CreditBalance'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/project', label: 'Project', icon: FolderKanban },
  { href: '/landing', label: 'Landing Pages', icon: Layout },
  { href: '/evolution', label: 'Agent Evolution', icon: Dna },
  { href: '/tools', label: 'Tools', icon: Wrench },
]

function useStoreValue<T>(selector: () => T): T {
  return useSyncExternalStore(store.subscribe, selector, selector)
}

export default function Sidebar() {
  const pathname = usePathname()
  const collapsed = useStoreValue(store.isSidebarCollapsed)
  const [hovered, setHovered] = useState(false)
  const { user } = useUser()

  // Display name priority: name → email local-part → 'Account'
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  const displayName =
    (user?.fullName && user.fullName.trim()) ||
    (primaryEmail ? primaryEmail.split('@')[0] : 'Account')
  const displaySub = primaryEmail ?? 'Signed in'

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
        fixed left-0 top-0 bottom-0 bg-white border-r border-[var(--border)] flex flex-col z-50
        transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-[240px]' : 'w-[64px]'}
      `}
    >
      {/* Logo + Theme toggle */}
      <div className={`px-5 py-5 border-b border-[var(--border-light)] flex items-center ${isExpanded ? 'justify-between' : 'justify-center px-3'}`}>
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          {isExpanded && (
            <div className="overflow-hidden whitespace-nowrap">
              <span className="text-[15px] font-bold tracking-tight text-gray-900">Moboost</span>
              <span className="text-[15px] font-bold tracking-tight text-emerald-600 ml-1">AI</span>
            </div>
          )}
        </Link>
        {isExpanded && <ThemeToggle compact />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={!isExpanded ? label : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
                transition-all duration-150
                ${!isExpanded ? 'justify-center' : ''}
                ${isActive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
                }
              `}
            >
              <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
              {isExpanded && <span className="overflow-hidden whitespace-nowrap">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom — Credits + Notification + User */}
      <div className="border-t border-[var(--border-light)] p-3 space-y-1">
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
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors
                ${!isExpanded ? 'justify-center' : ''}
              `}
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
                  <div className="text-[13px] font-semibold text-gray-900 truncate">
                    {displayName}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">
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
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition-colors text-white text-[13px] font-semibold shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Sign up — 50 credits free
                  </button>
                </SignUpButton>
              )}
              <SignInButton mode="redirect">
                <button
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left
                    ${!isExpanded ? 'justify-center' : ''}
                  `}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-emerald-700" />
                  </div>
                  {isExpanded && (
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[13px] font-semibold text-gray-900">
                        Sign in
                      </span>
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
