'use client'

/**
 * WelcomeBanner — first-impression banner shown on the home page after
 * a user finishes onboarding.
 *
 * Apple design: clean, minimal card with accent blue CTA.
 * Behavior:
 *   - Fetches /api/me on mount.
 *   - If unauthenticated → renders nothing.
 *   - If authenticated AND has product_info → renders the banner.
 *   - Dismissal is sticky in localStorage.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, X, ArrowRight, ExternalLink, Loader2 } from 'lucide-react'
import { useUser } from '@clerk/nextjs'

type ProductInfo = {
  productName?: string | null
  productUrl?: string | null
  vertical?: string | null
  description?: string | null
} | null

type MeResponse = {
  ok: boolean
  email?: string | null
  onboardedAt?: string | null
  productInfo?: ProductInfo
  error?: string
}

const DISMISS_KEY = 'moboost:welcomeBannerDismissed'

export default function WelcomeBanner() {
  const { isLoaded, isSignedIn, user } = useUser()
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') {
        setDismissed(true)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setMe(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const data = (await res.json()) as MeResponse
        if (cancelled) return
        if (res.ok && data.ok) setMe(data)
      } catch {
        // Banner is non-critical; swallow errors.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, user?.id])

  if (!isLoaded || !isSignedIn) return null
  if (dismissed) return null
  if (!me?.productInfo) return null

  const { productName, productUrl, vertical } = me.productInfo

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="relative w-full max-w-[720px] mx-auto mb-8 rounded-2xl p-6 overflow-hidden"
      style={{
        background: '#f5f5f7',
        border: 'none',
        boxShadow: 'rgba(0,0,0,0.22) 3px 5px 30px',
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-black/5"
        aria-label="Dismiss welcome banner"
      >
        <X className="w-4 h-4" style={{ color: '#1d1d1f' }} />
      </button>

      <div className="flex items-start gap-4 pr-8">
        <div
          className="flex-shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-lg"
          style={{
            background: '#0071e3',
            boxShadow: 'rgba(0,0,0,0.22) 0 2px 8px',
          }}
        >
          <Sparkles className="w-6 h-6 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-lg font-semibold"
            style={{
              color: '#1d1d1f',
              fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
              letterSpacing: '0.5px',
            }}
          >
            Welcome to Moboost
            {productName ? (
              <>
                {' — let\u2019s grow '}
                <span style={{ color: '#0071e3' }}>{productName}</span>
              </>
            ) : (
              ''
            )}
          </div>

          <div
            className="text-sm mt-1.5 leading-relaxed flex items-center gap-2 flex-wrap"
            style={{
              color: '#5a5a5e',
              fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
              lineHeight: '1.6',
            }}
          >
            <span>
              You have <strong style={{ color: '#1d1d1f' }}>50 free credits</strong>. Spin up your first lite report to see how it works.
            </span>
            {productUrl && (
              <a
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors hover:bg-black/5"
                style={{
                  color: '#0071e3',
                  border: '1px solid #d5d5d7',
                  fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {(() => {
                  try {
                    return new URL(productUrl).hostname.replace(/^www\./, '')
                  } catch {
                    return productUrl
                  }
                })()}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {vertical && (
              <span
                className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  color: '#5a5a5e',
                  background: '#f5f5f7',
                  border: '1px solid #d5d5d7',
                  fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {vertical}
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={generating}
              onClick={async () => {
                setGenerating(true)
                setGenError(null)
                try {
                  const meRes = await fetch('/api/me', { credentials: 'same-origin' })
                  const meData = await meRes.json()
                  const productId = meData?.productId
                  if (!productId) {
                    setGenError('No product found. Complete onboarding first.')
                    return
                  }
                  const res = await fetch('/api/reports/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId, kind: 'lite' }),
                  })
                  const data = await res.json()
                  if (data.ok && data.reportId) {
                    router.push(`/report/${data.reportId}`)
                  } else {
                    setGenError(data.error || 'Report generation failed')
                  }
                } catch (err) {
                  setGenError((err as Error).message)
                } finally {
                  setGenerating(false)
                }
              }}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-all hover:opacity-90 disabled:opacity-60"
              style={{
                background: '#0071e3',
                color: '#fff',
                fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif',
                boxShadow: generating ? 'none' : 'rgba(0,113,227,0.3) 0 2px 8px',
              }}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate first report
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            {genError && (
              <span className="text-xs" style={{ color: '#ff3b30' }}>
                {genError}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
