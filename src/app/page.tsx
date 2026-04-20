'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, FolderKanban, Clock
} from 'lucide-react'
import { store } from '@/lib/store'
import WelcomeBanner from '@/components/WelcomeBanner'
import UnifiedCollector from '@/components/UnifiedCollector'
import { useLocale } from '@/lib/i18n/LocaleProvider'

const TEMPLATES = [
  { id: 't1', name: 'Sports Betting Hero', category: 'Sports', preview: '🏈', desc: 'High-energy sports CTA with live odds' },
  { id: 't2', name: 'Casino Welcome Bonus', category: 'Casino', preview: '🎰', desc: 'Welcome offer with deposit match' },
  { id: 't3', name: 'Esports Tournament', category: 'Esports', preview: '🎮', desc: 'Tournament promo with team showcase' },
  { id: 't4', name: 'Live Dealer Promo', category: 'Casino', preview: '🃏', desc: 'Immersive live dealer experience' },
  { id: 't5', name: 'Parlay Builder', category: 'Sports', preview: '📊', desc: 'Multi-bet builder promotional' },
  { id: 't6', name: 'Mobile App Download', category: 'General', preview: '📱', desc: 'App store conversion landing' },
]

function useStoreValue<T>(sel: () => T): T {
  return useSyncExternalStore(store.subscribe, sel, sel)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function HomePage() {
  const router = useRouter()
  const { t } = useLocale()
  const projects = useStoreValue(store.getProjects)

  // Fetch user's product info for the collector context
  const [productInfo, setProductInfo] = useState<{
    productId: string | null
    productName: string | null
    productUrl: string | null
    vertical: string | null
  }>({ productId: null, productName: null, productUrl: null, vertical: null })

  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setProductInfo({
            productId: data.productId ?? null,
            productName: data.productInfo?.productName ?? null,
            productUrl: data.productInfo?.productUrl ?? null,
            vertical: data.productInfo?.vertical ?? null,
          })
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="w-full" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Hero Section */}
      <div
        className="w-full py-16 px-8 text-center"
        style={{
          background: 'var(--bg)',
          color: 'var(--text-1)',
        }}
      >
        <div className="max-w-[720px] mx-auto">
          <div style={{ marginBottom: '24px' }}>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{
                background: 'var(--brand-light)',
                border: '1px solid rgba(192,228,99,0.15)',
                fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '12px',
                fontWeight: '500',
                color: 'var(--brand)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
              <span>Moboost AI</span>
            </div>
          </div>
          <h1
            className="mb-3"
            style={{
              fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '56px',
              fontWeight: '600',
              lineHeight: '1.07',
              letterSpacing: '-0.5px',
              color: 'var(--text-1)',
            }}
          >
            Create with AI
          </h1>
          <p
            style={{
              fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '17px',
              fontWeight: '400',
              color: 'var(--text-3)',
              lineHeight: '1.47',
              letterSpacing: '-0.374px',
            }}
          >
            {t('home.tagline')}
          </p>
        </div>
      </div>

      {/* Collector Section */}
      <div className="w-full px-8 py-12" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[720px] mx-auto">
          <WelcomeBanner />

          {/* Unified Collector — dark glass surface */}
          <div
            className="rounded-2xl p-6 mb-8"
            style={{
              background: 'var(--surface-1)',
              backdropFilter: 'saturate(120%) blur(24px)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <UnifiedCollector
              productId={productInfo.productId}
              productName={productInfo.productName}
              productUrl={productInfo.productUrl}
              vertical={productInfo.vertical}
            />
          </div>
        </div>
      </div>

      {/* Recent Projects */}
      <div className="w-full px-8 py-12" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[720px] mx-auto">
          <h2
            className="mb-6"
            style={{
              fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '28px',
              fontWeight: '600',
              color: 'var(--text-1)',
              lineHeight: '1.14',
              letterSpacing: '-0.3px',
            }}
          >
            Your Projects
          </h2>
          <div className="flex gap-3">
            {projects.length === 0 ? (
              <div
                className="flex-1 px-6 py-8 rounded-2xl text-center"
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-3)',
                  fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: '14px',
                }}
              >
                No projects yet — start by creating something above
              </div>
            ) : (
              <>
                {projects.slice(0, 3).map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => router.push(`/project/${proj.id}`)}
                    className="card-hover flex-1 px-5 py-5 rounded-2xl text-left transition-all"
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--surface-3)'
                      e.currentTarget.style.borderColor = 'rgba(192,228,99,0.12)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--surface-1)'
                      e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <FolderKanban className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                      <div
                        className="text-sm font-semibold truncate"
                        style={{
                          color: 'var(--text-1)',
                          fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
                        }}
                      >
                        {proj.name}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2 text-xs"
                      style={{
                        color: 'var(--text-3)',
                        fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                      }}
                    >
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo(proj.createdAt)}</span>
                      <span>·</span>
                      <span>{proj.assets.length} assets</span>
                    </div>
                  </button>
                ))}
                {projects.length <= 3 && (
                  <button
                    onClick={() => router.push('/project')}
                    className="flex-shrink-0 px-5 py-5 rounded-2xl text-sm flex items-center justify-center gap-1.5 min-w-[100px] transition-colors"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--text-3)',
                      fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(192,228,99,0.2)'
                      e.currentTarget.style.color = 'var(--brand)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.color = 'var(--text-3)'
                    }}
                  >
                    All →
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Templates */}
      <div className="w-full px-8 py-12" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[720px] mx-auto">
          <h2
            className="mb-6"
            style={{
              fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '28px',
              fontWeight: '600',
              color: 'var(--text-1)',
              lineHeight: '1.14',
              letterSpacing: '-0.3px',
            }}
          >
            Templates
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                className="px-5 py-6 rounded-2xl text-left transition-all"
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-3)'
                  e.currentTarget.style.borderColor = 'rgba(192,228,99,0.12)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--surface-1)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div
                  className="text-4xl mb-4"
                  style={{ lineHeight: '1' }}
                >
                  {t.preview}
                </div>
                <div
                  className="font-semibold mb-1"
                  style={{
                    color: 'var(--text-1)',
                    fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '16px',
                  }}
                >
                  {t.name}
                </div>
                <div
                  className="mb-4"
                  style={{
                    color: 'var(--text-3)',
                    fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '13px',
                    lineHeight: '1.4',
                  }}
                >
                  {t.desc}
                </div>
                <span
                  className="inline-block text-xs px-3 py-1.5 rounded-full"
                  style={{
                    color: 'var(--brand)',
                    background: 'var(--brand-light)',
                    border: '1px solid rgba(192,228,99,0.2)',
                    fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                    fontWeight: '500',
                  }}
                >
                  {t.category}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
