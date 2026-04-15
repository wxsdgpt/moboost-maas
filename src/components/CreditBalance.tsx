'use client'

/**
 * CreditBalance — sidebar pill showing the user's current credit total.
 *
 * Polls /api/credits/balance every 30s.  Skips polling entirely when
 * the user is signed out.  Re-fetches immediately on user change
 * (UserScopeGuard already resets on sign-out, so we just key the
 * effect on the user id).
 *
 * Visual: small pill with a Sparkles icon + integer total.  Shows
 * a soft skeleton placeholder during the first load so the layout
 * doesn't shift.
 */
import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useUser } from '@clerk/nextjs'

const POLL_MS = 30_000

type BalanceResponse = {
  ok: boolean
  total?: number
  bySource?: { subscription: number; bonus: number; topup: number }
  error?: string
}

export default function CreditBalance({
  collapsed = false,
}: {
  collapsed?: boolean
}) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      setTotal(null)
      return
    }

    let cancelled = false
    const fetchBalance = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/credits/balance', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const data = (await res.json()) as BalanceResponse
        if (cancelled) return
        if (!res.ok || !data.ok || typeof data.total !== 'number') {
          throw new Error(data.error ?? `request_failed_${res.status}`)
        }
        setTotal(data.total)
        setError(null)
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchBalance()
    const id = window.setInterval(fetchBalance, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [isLoaded, isSignedIn, user?.id])

  if (!isLoaded || !isSignedIn) return null

  // Collapsed sidebar: just the icon + tiny number underneath.
  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-0.5 px-1 py-1 rounded-lg"
        title={total !== null ? `${total} credits` : 'Loading credits…'}
      >
        <Sparkles className="w-4 h-4" style={{ color: '#0071e3' }} />
        <span
          className="text-[10px] font-medium leading-none tabular-nums"
          style={{ color: '#ffffff' }}
        >
          {total !== null ? total : '—'}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
      }}
      title={
        error
          ? `Failed to load: ${error}`
          : total !== null
            ? `${total} credits available`
            : 'Loading credits…'
      }
    >
      <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#0071e3' }} />
      <span
        className="text-[12px] font-medium tabular-nums"
        style={{ color: '#ffffff' }}
      >
        {total !== null ? (
          <>
            {total} <span style={{ opacity: 0.6, fontWeight: 400 }}>credits</span>
          </>
        ) : loading ? (
          <Loader2 className="w-3 h-3 animate-spin inline" />
        ) : (
          '—'
        )}
      </span>
    </div>
  )
}
