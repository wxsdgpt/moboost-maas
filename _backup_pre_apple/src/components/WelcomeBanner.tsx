'use client'

/**
 * WelcomeBanner — first-impression banner shown on the home page after
 * a user finishes onboarding.
 *
 * Behavior:
 *   - Fetches /api/me on mount.
 *   - If unauthenticated → renders nothing (anonymous home page stays
 *     as it was).
 *   - If authenticated AND has product_info → renders the banner with
 *     the product name + a "First report" CTA.
 *   - The user can dismiss the banner; dismissal is sticky in
 *     localStorage so it doesn't keep nagging on every visit.
 *
 * Why client-side fetch instead of server-rendered:
 *   The home page is currently a client component already (`'use client'`)
 *   and bringing it server-side would require more rework than is worth
 *   right now.  An extra GET on mount is cheap.
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
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

  // Read sticky dismissal flag.
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
      className="relative w-full max-w-[720px] mx-auto mb-6 rounded-2xl p-5 overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(168,85,247,0.06) 50%, rgba(217,70,239,0.06))',
        border: '1px solid rgba(168,85,247,0.25)',
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 p-1 rounded-md transition-colors hover:bg-white/10"
        aria-label="Dismiss welcome banner"
        style={{ color: 'var(--text-3)' }}
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl"
          style={{
            background:
              'linear-gradient(135deg, #22d3ee 0%, #a855f7 55%, #d946ef 100%)',
            boxShadow:
              '0 8px 24px -8px rgba(168,85,247,0.45), 0 0 16px rgba(34,211,238,0.25)',
          }}
        >
          <Sparkles className="w-5 h-5 text-white drop-shadow-sm" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Welcome to Moboost
            {productName ? (
              <>
                {' — let\u2019s grow '}
                <span
                  style={{
                    background: 'linear-gradient(90deg, #22d3ee, #d946ef)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {productName}
                </span>
              </>
            ) : (
              ''
            )}
          </div>

          <div
            className="text-[13px] mt-1 leading-relaxed flex items-center gap-2 flex-wrap"
            style={{ color: 'var(--text-2)' }}
          >
            <span>
              You have <strong style={{ color: 'var(--text-1)' }}>50 free credits</strong>.
              Spin up your first lite report to see how it works.
            </span>
            {productUrl && (
              <a
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-md transition-colors hover:bg-white/10"
                style={{
                  color: '#22d3ee',
                  border: '1px solid rgba(34,211,238,0.35)',
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
                className="text-[12px] px-2 py-0.5 rounded-md"
                style={{
                  color: 'var(--text-2)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-light)',
                }}
              >
                {vertical}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={generating}
              onClick={async () => {
                setGenerating(true)
                setGenError(null)
                try {
                  // Fetch product id from /api/me
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
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{
                background:
                  'linear-gradient(90deg, #22d3ee 0%, #a855f7 50%, #d946ef 100%)',
                color: '#fff',
              }}
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate first report
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
            {genError && (
              <span className="text-xs text-red-500">{genError}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
