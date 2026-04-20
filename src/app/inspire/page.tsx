'use client'

/**
 * Inspire — Creative template gallery with Pinterest-style masonry grid.
 *
 * Three tabs: Video / Image / Landing Page
 * Each template card shows a preview thumbnail, title, tags, and actions.
 * Cards link to a preview modal with "Use in Project" + "Download" CTAs.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Play,
  Image as ImageIcon,
  Layout,
  Download,
  FolderPlus,
  X,
  Search,
  Sparkles,
  Eye,
  Star,
  Flame,
  Clock,
  Filter,
} from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'

// ─── Types ──────────────────────────────────────────────────────────────────

type TemplateCategory = 'video' | 'image' | 'landing'

interface Template {
  id: string
  title: string
  description: string
  category: TemplateCategory
  tags: string[]
  thumbnail: string // gradient placeholder (CSS)
  aspectRatio: number // width/height for masonry
  views: number
  isFeatured?: boolean
  isNew?: boolean
}

// ─── Hardcoded Sample Templates ────────────────────────────────────────────

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(135deg, #f5576c 0%, #ff9a76 100%)',
  'linear-gradient(135deg, #667eea 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #c0e463 20%, #38f9d7 100%)',
  'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #c0e463 100%)',
]

const TEMPLATES: Template[] = [
  // ── Video Templates ──
  { id: 'v1', title: 'Sports Betting Promo — 15s', description: 'High-energy sports promo with dynamic transitions and live odds overlay. Perfect for social media ads.', category: 'video', tags: ['Sports', 'Betting', 'Promo'], thumbnail: GRADIENTS[0], aspectRatio: 16/9, views: 2840, isFeatured: true },
  { id: 'v2', title: 'Casino Jackpot Reveal', description: 'Dramatic slot machine animation with particle effects and winning celebration sequence.', category: 'video', tags: ['Casino', 'Slots', 'Animation'], thumbnail: GRADIENTS[1], aspectRatio: 9/16, views: 1920, isNew: true },
  { id: 'v3', title: 'Live Dealer Introduction', description: 'Elegant live dealer table introduction with camera movement and brand overlay.', category: 'video', tags: ['Live Casino', 'Dealer', 'Intro'], thumbnail: GRADIENTS[2], aspectRatio: 16/9, views: 1540 },
  { id: 'v4', title: 'Welcome Bonus Explainer', description: 'Motion graphics explainer showing deposit bonus flow with step-by-step animation.', category: 'video', tags: ['Bonus', 'Explainer', 'Motion'], thumbnail: GRADIENTS[3], aspectRatio: 1, views: 3210, isFeatured: true },
  { id: 'v5', title: 'Match Day Countdown', description: 'Pre-match hype video with team stats, countdown timer, and betting market previews.', category: 'video', tags: ['Sports', 'Countdown', 'Match'], thumbnail: GRADIENTS[4], aspectRatio: 16/9, views: 980 },
  { id: 'v6', title: 'VIP Loyalty Program', description: 'Premium-feel VIP tier showcase with gold accents and exclusive benefit reveals.', category: 'video', tags: ['VIP', 'Loyalty', 'Premium'], thumbnail: GRADIENTS[5], aspectRatio: 9/16, views: 760, isNew: true },
  { id: 'v7', title: 'App Download CTA — Stories', description: 'Vertical stories format with app screenshots, swipe-up CTA, and download incentive.', category: 'video', tags: ['App', 'Stories', 'CTA'], thumbnail: GRADIENTS[6], aspectRatio: 9/16, views: 2100 },
  { id: 'v8', title: 'Esports Tournament Highlight', description: 'Fast-cut highlight reel with game footage, player stats, and betting markets overlay.', category: 'video', tags: ['Esports', 'Tournament', 'Highlight'], thumbnail: GRADIENTS[7], aspectRatio: 16/9, views: 1680 },

  // ── Image Templates ──
  { id: 'i1', title: 'Multi-Sport Banner — Desktop', description: 'Wide format banner featuring multiple sports with dynamic composition and odds display.', category: 'image', tags: ['Sports', 'Banner', 'Desktop'], thumbnail: GRADIENTS[8], aspectRatio: 3/1, views: 4520, isFeatured: true },
  { id: 'i2', title: 'Slot Game Promo Card', description: 'Rich visual card for slot game promotion with jackpot amount and play CTA.', category: 'image', tags: ['Casino', 'Slots', 'Card'], thumbnail: GRADIENTS[9], aspectRatio: 4/5, views: 3180 },
  { id: 'i3', title: 'Live Casino Social Post', description: 'Instagram-ready square post with live dealer imagery and elegant typography.', category: 'image', tags: ['Live Casino', 'Social', 'Instagram'], thumbnail: GRADIENTS[10], aspectRatio: 1, views: 2860 },
  { id: 'i4', title: 'Welcome Offer — Email Header', description: 'Email-optimized header image with deposit bonus callout and mobile-friendly design.', category: 'image', tags: ['Email', 'Bonus', 'Header'], thumbnail: GRADIENTS[11], aspectRatio: 2/1, views: 1940 },
  { id: 'i5', title: 'Sports Hero — Mobile App', description: 'Full-screen mobile hero image with live match visual and bet slip integration.', category: 'image', tags: ['Sports', 'Mobile', 'Hero'], thumbnail: GRADIENTS[0], aspectRatio: 9/16, views: 2290, isNew: true },
  { id: 'i6', title: 'Responsible Gaming Badge', description: 'Trust-building responsible gaming visual with certification logos and safety messaging.', category: 'image', tags: ['Compliance', 'Trust', 'Badge'], thumbnail: GRADIENTS[3], aspectRatio: 16/9, views: 890 },
  { id: 'i7', title: 'Tournament Bracket Visual', description: 'Clean tournament bracket infographic with team logos and match progression.', category: 'image', tags: ['Esports', 'Tournament', 'Infographic'], thumbnail: GRADIENTS[5], aspectRatio: 4/3, views: 1450, isFeatured: true },
  { id: 'i8', title: 'Crypto Deposit Promo', description: 'Modern crypto-themed promotional graphic with Bitcoin/ETH icons and bonus offer.', category: 'image', tags: ['Crypto', 'Deposit', 'Promo'], thumbnail: GRADIENTS[1], aspectRatio: 1, views: 2010 },
  { id: 'i9', title: 'Weekend Special — Stories', description: 'Vertical stories image with weekend promotion details and countdown urgency.', category: 'image', tags: ['Weekend', 'Stories', 'Promo'], thumbnail: GRADIENTS[7], aspectRatio: 9/16, views: 1630, isNew: true },

  // ── Landing Page Templates ──
  { id: 'l1', title: 'Sportsbook Launch Page', description: 'Full-featured sportsbook landing with hero section, live odds widget, popular markets, and registration CTA.', category: 'landing', tags: ['Sports', 'Launch', 'Full Page'], thumbnail: GRADIENTS[11], aspectRatio: 3/4, views: 5120, isFeatured: true },
  { id: 'l2', title: 'Casino Welcome Funnel', description: 'High-converting casino welcome page with game carousel, bonus calculator, and social proof.', category: 'landing', tags: ['Casino', 'Welcome', 'Conversion'], thumbnail: GRADIENTS[4], aspectRatio: 3/4, views: 4380, isFeatured: true },
  { id: 'l3', title: 'VIP Invitation Page', description: 'Exclusive VIP signup page with tier benefits, member testimonials, and premium aesthetic.', category: 'landing', tags: ['VIP', 'Exclusive', 'Premium'], thumbnail: GRADIENTS[6], aspectRatio: 3/4, views: 2640 },
  { id: 'l4', title: 'Mobile App Download', description: 'App download landing with device mockups, feature highlights, QR code, and store badges.', category: 'landing', tags: ['App', 'Download', 'Mobile'], thumbnail: GRADIENTS[2], aspectRatio: 3/4, views: 3870, isNew: true },
  { id: 'l5', title: 'Esports Betting Hub', description: 'Esports-focused landing with tournament calendar, live streams, and game-specific betting markets.', category: 'landing', tags: ['Esports', 'Hub', 'Betting'], thumbnail: GRADIENTS[8], aspectRatio: 3/4, views: 1980 },
  { id: 'l6', title: 'Affiliate Partner Page', description: 'Partner recruitment landing with commission structure, tracking dashboard preview, and signup form.', category: 'landing', tags: ['Affiliate', 'Partner', 'B2B'], thumbnail: GRADIENTS[10], aspectRatio: 3/4, views: 1320 },
]

// ─── Tab Config ─────────────────────────────────────────────────────────────

const TABS: { key: TemplateCategory; label: string; icon: typeof Play }[] = [
  { key: 'video', label: 'Video', icon: Play },
  { key: 'image', label: 'Image', icon: ImageIcon },
  { key: 'landing', label: 'Landing Page', icon: Layout },
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function InspirePage() {
  const { t } = useLocale()
  const [activeTab, setActiveTab] = useState<TemplateCategory>('video')
  const [searchQuery, setSearchQuery] = useState('')
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [filterTag, setFilterTag] = useState<string | null>(null)

  // Filtered templates
  const filtered = useMemo(() => {
    let items = TEMPLATES.filter(tpl => tpl.category === activeTab)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        tpl =>
          tpl.title.toLowerCase().includes(q) ||
          tpl.tags.some(tag => tag.toLowerCase().includes(q))
      )
    }
    if (filterTag) {
      items = items.filter(tpl => tpl.tags.includes(filterTag))
    }
    return items
  }, [activeTab, searchQuery, filterTag])

  // All tags for the current tab
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    TEMPLATES.filter(tpl => tpl.category === activeTab).forEach(tpl =>
      tpl.tags.forEach(tag => tags.add(tag))
    )
    return Array.from(tags).sort()
  }, [activeTab])

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)', color: 'var(--text-1)' }}
    >
      {/* ── Header ── */}
      <div
        className="sticky top-0 z-30"
        style={{
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          {/* Title row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--brand-light)' }}
              >
                <Sparkles className="w-[18px] h-[18px]" style={{ color: 'var(--brand)' }} />
              </div>
              <div>
                <h1 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>
                  Inspire
                </h1>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  AI-powered creative templates for iGaming marketing
                </p>
              </div>
            </div>

            {/* Search */}
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: 'var(--surface-3)',
                border: '1px solid var(--border)',
                width: 280,
              }}
            >
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  setFilterTag(null)
                }}
                placeholder="Search templates…"
                className="bg-transparent border-none outline-none text-sm flex-1"
                style={{ color: 'var(--text-1)' }}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {TABS.map(tab => {
              const isActive = activeTab === tab.key
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key)
                    setFilterTag(null)
                    setSearchQuery('')
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: isActive ? 'var(--brand)' : 'transparent',
                    color: isActive ? 'var(--brand-contrast)' : 'var(--text-3)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? 'rgba(0,0,0,0.15)' : 'var(--surface-3)',
                      color: isActive ? 'var(--brand-contrast)' : 'var(--text-3)',
                    }}
                  >
                    {TEMPLATES.filter(t => t.category === tab.key).length}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Tag filters ── */}
      <div className="max-w-[1400px] mx-auto px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
          <button
            onClick={() => setFilterTag(null)}
            className="text-xs px-3 py-1.5 rounded-full transition-all"
            style={{
              background: !filterTag ? 'var(--brand-light)' : 'var(--surface-3)',
              color: !filterTag ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${!filterTag ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              className="text-xs px-3 py-1.5 rounded-full transition-all"
              style={{
                background: filterTag === tag ? 'var(--brand-light)' : 'var(--surface-3)',
                color: filterTag === tag ? 'var(--brand)' : 'var(--text-3)',
                border: `1px solid ${filterTag === tag ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Masonry Grid ── */}
      <div className="max-w-[1400px] mx-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Search className="w-10 h-10 mb-3" style={{ color: 'var(--text-3)' }} />
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              No templates found. Try a different search or filter.
            </p>
          </div>
        ) : (
          <MasonryGrid templates={filtered} onPreview={setPreviewTemplate} />
        )}
      </div>

      {/* ── Preview Modal ── */}
      {previewTemplate && (
        <PreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  )
}

// ─── Masonry Grid Component ─────────────────────────────────────────────────

function MasonryGrid({
  templates,
  onPreview,
}: {
  templates: Template[]
  onPreview: (t: Template) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(4)

  useEffect(() => {
    const update = () => {
      const w = containerRef.current?.clientWidth ?? 1200
      if (w < 600) setColumns(2)
      else if (w < 900) setColumns(3)
      else setColumns(4)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Distribute templates into columns by shortest column height
  const cols = useMemo(() => {
    const result: Template[][] = Array.from({ length: columns }, () => [])
    const heights = new Array(columns).fill(0)
    templates.forEach(tpl => {
      const shortest = heights.indexOf(Math.min(...heights))
      result[shortest].push(tpl)
      // Approximate height based on aspect ratio (thumbnail + info card ~80px)
      heights[shortest] += (1 / tpl.aspectRatio) * 300 + 80
    })
    return result
  }, [templates, columns])

  return (
    <div
      ref={containerRef}
      className="flex gap-4"
      style={{ alignItems: 'flex-start' }}
    >
      {cols.map((col, i) => (
        <div key={i} className="flex-1 flex flex-col gap-4">
          {col.map(tpl => (
            <TemplateCard key={tpl.id} template={tpl} onClick={() => onPreview(tpl)} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Template Card ──────────────────────────────────────────────────────────

function TemplateCard({
  template: tpl,
  onClick,
}: {
  template: Template
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-300"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered ? 'var(--shadow-lg)' : 'none',
      }}
    >
      {/* Thumbnail */}
      <div
        className="relative w-full flex items-center justify-center overflow-hidden"
        style={{
          paddingBottom: `${(1 / tpl.aspectRatio) * 100}%`,
          background: tpl.thumbnail,
        }}
      >
        {/* Overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
          style={{
            background: 'rgba(0,0,0,0.4)',
            opacity: hovered ? 1 : 0,
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'var(--brand)', transform: hovered ? 'scale(1)' : 'scale(0.8)', transition: 'transform .3s' }}
          >
            <Eye className="w-5 h-5" style={{ color: 'var(--brand-contrast)' }} />
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {tpl.isFeatured && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
              style={{ background: 'var(--brand)', color: 'var(--brand-contrast)' }}
            >
              <Star className="w-3 h-3" /> Featured
            </span>
          )}
          {tpl.isNew && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
              style={{ background: 'rgba(255,59,48,0.9)', color: '#fff' }}
            >
              <Flame className="w-3 h-3" /> New
            </span>
          )}
        </div>

        {/* Category icon for video */}
        {tpl.category === 'video' && (
          <div className="absolute bottom-2.5 right-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
            >
              <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: '#fff', fill: '#fff' }} />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5">
        <h3
          className="text-sm font-medium mb-1 line-clamp-1"
          style={{ color: 'var(--text-1)' }}
        >
          {tpl.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {tpl.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: 'var(--surface-3)',
                color: 'var(--text-3)',
                border: '1px solid var(--border)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
          <Eye className="w-3 h-3" />
          <span className="text-[11px]">{tpl.views.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Preview Modal ──────────────────────────────────────────────────────────

function PreviewModal({
  template: tpl,
  onClose,
}: {
  template: Template
  onClose: () => void
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-auto rounded-2xl"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{
            background: 'var(--surface-3)',
            color: 'var(--text-3)',
            border: '1px solid var(--border)',
          }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Preview area */}
        <div
          className="w-full flex items-center justify-center"
          style={{
            background: tpl.thumbnail,
            minHeight: 320,
            maxHeight: 480,
          }}
        >
          <div className="text-center p-8">
            {tpl.category === 'video' && (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}
              >
                <Play className="w-8 h-8 ml-1" style={{ color: '#fff', fill: '#fff' }} />
              </div>
            )}
            <p className="text-white/60 text-sm">Preview placeholder</p>
          </div>
        </div>

        {/* Details */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
                {tpl.title}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {tpl.description}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0" style={{ color: 'var(--text-3)' }}>
              <Eye className="w-4 h-4" />
              <span className="text-sm">{tpl.views.toLocaleString()}</span>
            </div>
          </div>

          {/* Tags */}
          <div className="flex gap-2 flex-wrap mb-6">
            {tpl.tags.map(tag => (
              <span
                key={tag}
                className="text-xs px-3 py-1 rounded-full"
                style={{
                  background: 'var(--surface-3)',
                  color: 'var(--text-2)',
                  border: '1px solid var(--border)',
                }}
              >
                {tag}
              </span>
            ))}
            <span
              className="text-xs px-3 py-1 rounded-full capitalize"
              style={{
                background: 'var(--brand-light)',
                color: 'var(--brand)',
                border: '1px solid var(--brand)',
              }}
            >
              {tpl.category === 'landing' ? 'Landing Page' : tpl.category}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all"
              style={{
                background: 'var(--brand)',
                color: 'var(--brand-contrast)',
                boxShadow: '0 4px 24px rgba(192,228,99,0.2)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 40px rgba(192,228,99,0.3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(192,228,99,0.2)'
              }}
            >
              <FolderPlus className="w-4 h-4" />
              Use in Project
            </button>
            <button
              className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all"
              style={{
                background: 'var(--surface-3)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--brand)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
