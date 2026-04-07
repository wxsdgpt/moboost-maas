'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, FolderKanban, Dna, Wrench, Sparkles, Settings, LogOut, ChevronDown, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { store } from '@/lib/store'
import { NotificationBell } from './Notifications'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/project', label: 'Project', icon: FolderKanban },
  { href: '/evolution', label: 'Agent Evolution', icon: Dna },
  { href: '/tools', label: 'Tools', icon: Wrench },
]

function useStoreValue<T>(selector: () => T): T {
  return useSyncExternalStore(store.subscribe, selector, selector)
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const collapsed = useStoreValue(store.isSidebarCollapsed)
  const [hovered, setHovered] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  // Hide sidebar on workspace pages and login page — they have their own layout
  const isWorkspace = /^\/project\/[^/]+$/.test(pathname)
  const isLogin = pathname === '/login'
  if (isWorkspace || isLogin) return null

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
      {/* Logo */}
      <div className={`px-5 py-5 border-b border-[var(--border-light)] flex items-center ${!isExpanded ? 'justify-center px-3' : ''}`}>
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

      {/* Bottom — Notification + User */}
      <div className="border-t border-[var(--border-light)] p-3 space-y-1">
        {/* Notification bell */}
        <div className={`flex ${isExpanded ? 'px-1' : 'justify-center'}`}>
          <NotificationBell />
        </div>

        {/* User account */}
        <div className="relative">
          <button
            onClick={() => isExpanded && setShowUserMenu(!showUserMenu)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left
              ${!isExpanded ? 'justify-center' : ''}
            `}
          >
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-emerald-700" />
            </div>
            {isExpanded && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900 truncate">moboost</div>
                  <div className="text-[11px] text-gray-400 truncate">admin@moboost.ai</div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>

          {showUserMenu && isExpanded && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-[var(--border)] rounded-xl shadow-lg p-1.5 animate-fade-in">
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                <User className="w-4 h-4 text-gray-400" />
                Profile
              </button>
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                <Settings className="w-4 h-4 text-gray-400" />
                Settings
              </button>
              <div className="my-1 border-t border-[var(--border-light)]" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
