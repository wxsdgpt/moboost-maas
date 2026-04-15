'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Shield,
  Dna,
  Brain,
  Database,
  Cpu,
  Layout,
  PenTool,
  Users,
  Trash2,
  LogOut,
  ChevronRight,
  Activity,
  Sparkles,
  Settings,
  MessageSquare,
} from 'lucide-react'
import { useState } from 'react'

const navSections = [
  {
    label: '系统总览',
    items: [
      { href: '/admin', label: '控制台', icon: Activity },
    ],
  },
  {
    label: 'Evolution Agent',
    items: [
      { href: '/admin/evolution', label: '进化诊断', icon: Dna },
      { href: '/admin/mutations', label: '进化管理', icon: Sparkles },
      { href: '/admin/intelligence', label: '情报中心', icon: Cpu },
      { href: '/admin/agents', label: 'Agent注册表', icon: Brain },
    ],
  },
  {
    label: 'Meta-Agent',
    items: [
      { href: '/admin/meta', label: 'Agent工厂', icon: PenTool },
      { href: '/admin/meta?tab=data', label: '数据架构师', icon: Database },
      { href: '/admin/meta?tab=engine', label: '引擎架构师', icon: Cpu },
      { href: '/admin/meta?tab=frontend', label: '前端架构师', icon: Layout },
    ],
  },
  {
    label: 'LLM & 配置',
    items: [
      { href: '/admin/config', label: 'System Config', icon: Settings },
      { href: '/admin/prompts', label: 'Prompt Logs', icon: MessageSquare },
    ],
  },
  {
    label: '运维',
    items: [
      { href: '/admin/data', label: '数据管理', icon: Users },
      { href: '/reset', label: '数据重置', icon: Trash2 },
    ],
  },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-[240px] flex flex-col z-50"
      style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-5 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #e94560 0%, #0f3460 100%)' }}
        >
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-tight text-white">Moboost</span>
          <span className="text-[15px] font-bold tracking-tight ml-1" style={{ color: '#e94560' }}>Admin</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="px-5 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {section.label}
              </span>
            </div>
            {section.items.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href.split('?')[0]))
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-150"
                  style={{
                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                    background: isActive ? 'rgba(233, 69, 96, 0.15)' : 'transparent',
                  }}
                >
                  <Icon
                    className="w-[16px] h-[16px] flex-shrink-0"
                    style={{ color: isActive ? '#e94560' : 'rgba(255, 255, 255, 0.4)' }}
                  />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight className="w-3 h-3" style={{ color: '#e94560' }} />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom — Admin info + Logout */}
      <div
        className="p-3"
        style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(233, 69, 96, 0.2)' }}
          >
            <Shield className="w-4 h-4" style={{ color: '#e94560' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white">Admin</div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>管理员</div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
