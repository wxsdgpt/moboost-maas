'use client'

import { useState } from 'react'
import {
  Wrench, Search, Image, Globe, FileText, Languages,
  BarChart3, Database, Shield, Cpu, ArrowRight, Star,
  CheckCircle2, Clock, Zap, Video,
  type LucideIcon
} from 'lucide-react'

interface Tool {
  id: string
  name: string
  desc: string
  icon: LucideIcon
  category: 'intel' | 'creative' | 'landing' | 'management'
  status: 'available' | 'coming_soon'
  features: string[]
}

const TOOLS: Tool[] = [
  // Intel
  {
    id: 'competitor-radar',
    name: 'Competitor Radar',
    desc: 'Monitor competitor ad creatives, landing pages, and campaign strategies in real-time',
    icon: Search,
    category: 'intel',
    status: 'available',
    features: ['Meta Ad Library scanning', 'Google Ads Transparency', 'Creative trend analysis', 'Alert on major changes'],
  },
  {
    id: 'market-intelligence',
    name: 'Market Intelligence',
    desc: 'Industry-wide data aggregation covering regulations, market entries, and funding rounds',
    icon: BarChart3,
    category: 'intel',
    status: 'available',
    features: ['iGaming news aggregation', 'Regulatory change tracking', 'Market size estimation', 'Trend reports'],
  },
  // Creative
  {
    id: 'image-generator',
    name: 'AI Image Generator',
    desc: 'Create high-quality ad banners, social media posts, and display ads with NanoBanana Pro',
    icon: Image,
    category: 'creative',
    status: 'available',
    features: ['NanoBanana Pro (2K/4K)', 'Brand-consistent output', 'Multi-size batch export', 'Auto quality scoring (D1-D4)'],
  },
  {
    id: 'video-generator',
    name: 'AI Video Generator',
    desc: 'Generate promotional video clips, motion ads, and social media reels with VEO3',
    icon: Video,
    category: 'creative',
    status: 'available',
    features: ['VEO3 Ultra quality', 'Short-form video (6-15s)', 'Dynamic text overlays', 'Music/SFX integration'],
  },
  {
    id: 'localization',
    name: 'Creative Localization',
    desc: 'Adapt creatives for different markets — language, currency, cultural preferences, and compliance',
    icon: Languages,
    category: 'creative',
    status: 'coming_soon',
    features: ['Multi-language translation', 'Currency adaptation', 'Cultural sensitivity check', 'RTL layout support'],
  },
  // Landing Page
  {
    id: 'landing-builder',
    name: 'Landing Page Builder',
    desc: 'AI-powered landing page generation with Harness framework for quality control',
    icon: FileText,
    category: 'landing',
    status: 'available',
    features: ['Template library (Sports/Casino/Esports)', 'Harness: MUST / MUST NOT / CREATIVE zones', 'Error fallback handling', 'Responsive output'],
  },
  {
    id: 'ab-testing',
    name: 'A/B Test Manager',
    desc: 'Create and manage landing page variations with automated performance tracking',
    icon: Zap,
    category: 'landing',
    status: 'coming_soon',
    features: ['Auto-variant generation', 'Traffic splitting', 'Statistical significance', 'Winner detection'],
  },
  // Management
  {
    id: 'asset-dam',
    name: 'Asset Manager (DAM)',
    desc: 'Organize, tag, search, and manage all generated creatives in one place',
    icon: Database,
    category: 'management',
    status: 'available',
    features: ['Folder + tag system', 'Full-text search', 'Version history', 'Bulk export by channel spec'],
  },
  {
    id: 'compliance-checker',
    name: 'Compliance Checker',
    desc: 'Automated compliance review against iGaming advertising regulations by jurisdiction',
    icon: Shield,
    category: 'management',
    status: 'coming_soon',
    features: ['UKGC / MGA rule sets', 'Responsible gambling checks', 'Age gate verification', 'License info injection'],
  },
]

const CATEGORIES = [
  { key: 'all', label: 'All Tools' },
  { key: 'intel', label: 'Intelligence' },
  { key: 'creative', label: 'Creative Generation' },
  { key: 'landing', label: 'Landing Pages' },
  { key: 'management', label: 'Management' },
]

export default function ToolsPage() {
  const [activeCategory, setActiveCategory] = useState('all')

  const filteredTools = activeCategory === 'all' ? TOOLS : TOOLS.filter(t => t.category === activeCategory)

  return (
    <div className="p-8" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>MarTech Tools</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>
            {TOOLS.filter(t => t.status === 'available').length} active
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          Professional marketing technology toolkit built for iGaming
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ backgroundColor: 'var(--surface-1)' }}>
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className="px-4 py-2 rounded-md text-xs font-medium transition-all"
            style={activeCategory === key
              ? { backgroundColor: 'var(--surface-3)', color: 'var(--text-1)', boxShadow: 'var(--shadow-sm)' }
              : { color: 'var(--text-3)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-2 gap-4">
        {filteredTools.map(tool => (
          <div
            key={tool.id}
            className={`rounded-lg p-6 ${tool.status === 'coming_soon' ? 'opacity-70' : ''}`}
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand-light)' }}>
                <tool.icon className="w-5 h-5" style={{ color: 'var(--brand)' }} />
              </div>
              {tool.status === 'available' ? (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--brand)' }}>Available</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-5)' }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-4)' }}>Coming Soon</span>
                </div>
              )}
            </div>

            <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--text-1)' }}>{tool.name}</h3>
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-3)' }}>{tool.desc}</p>

            {/* Features */}
            <div className="space-y-1.5">
              {tool.features.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--brand)' }} />
                  {f}
                </div>
              ))}
            </div>

            {tool.status === 'available' && (
              <button className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90" style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast)' }}>
                Open Tool
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
