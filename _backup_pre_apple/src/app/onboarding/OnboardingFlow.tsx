'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import ParticleFlow from '@/components/ParticleFlow'

type Step = 'welcome' | 'product' | 'done'

type Props = {
  initialEmail: string
  bonusAmount: number
}

const VERTICALS = [
  'Casino / Slots',
  'Sports Betting',
  'Poker',
  'Lottery',
  'Fantasy Sports',
  'Esports Betting',
  'Bingo',
  'Other iGaming',
]

/**
 * Multi-step onboarding shell.  Mirrors the visual language of the
 * sign-in / sign-up pages (particle flow, dark glass card, gradient
 * primary button) so the post-signup transition feels continuous.
 *
 * Steps:
 *   1. welcome  — name the bonus, set expectations, single CTA
 *   2. product  — minimal product info form (name + url + vertical)
 *   3. done     — confirmation + auto-navigate to /project
 *
 * The actual side effects (insert product row, grant 50 credits,
 * stamp users.onboarded_at) all happen in a single POST to
 * /api/onboarding/complete on submit of step 2.
 */
export default function OnboardingFlow({ initialEmail, bonusAmount }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('welcome')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [productName, setProductName] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [vertical, setVertical] = useState('')
  const [description, setDescription] = useState('')

  async function submit() {
    setError(null)
    const url = productUrl.trim()
    if (!url) {
      setError('Please paste your website or App Store / Play Store URL.')
      return
    }
    if (!/^https?:\/\//i.test(url)) {
      setError('URL must start with http:// or https://')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: productName.trim() || undefined,
          productUrl: url,
          vertical: vertical || undefined,
          description: description.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `request_failed_${res.status}`)
      }
      setStep('done')
      // Auto-navigate after a beat so the user sees the confirmation.
      // Fresh sign-ups land on the home page, not the project workspace.
      setTimeout(() => router.push('/'), 1400)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: '#0a0a1a' }}
    >
      <ParticleFlow focused={false} loading={submitting} />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(10,10,26,0) 0%, rgba(10,10,26,0.35) 55%, rgba(10,10,26,0.85) 100%)',
          zIndex: 1,
        }}
      />

      <div
        className="relative flex items-center justify-center min-h-screen px-4 py-12"
        style={{ zIndex: 2 }}
      >
        <div className="w-full max-w-[520px]">
          {step === 'welcome' && (
            <WelcomeStep
              email={initialEmail}
              bonusAmount={bonusAmount}
              onContinue={() => setStep('product')}
            />
          )}
          {step === 'product' && (
            <ProductStep
              productName={productName}
              setProductName={setProductName}
              productUrl={productUrl}
              setProductUrl={setProductUrl}
              vertical={vertical}
              setVertical={setVertical}
              description={description}
              setDescription={setDescription}
              error={error}
              submitting={submitting}
              onBack={() => setStep('welcome')}
              onSubmit={submit}
            />
          )}
          {step === 'done' && <DoneStep bonusAmount={bonusAmount} />}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────── steps

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl border p-8 shadow-2xl animate-float-in-delay"
      style={{
        background: '#14162a',
        borderColor: 'rgba(255,255,255,0.10)',
      }}
    >
      {children}
    </div>
  )
}

function StepHeader({
  title,
  subtitle,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
}) {
  return (
    <div className="text-center mb-6 animate-float-in">
      <div
        className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
        style={{
          background:
            'linear-gradient(135deg, #22d3ee 0%, #a855f7 55%, #d946ef 100%)',
          boxShadow:
            '0 10px 40px -8px rgba(168, 85, 247, 0.55), 0 0 24px rgba(34, 211, 238, 0.35)',
        }}
      >
        <Sparkles className="w-7 h-7 text-white drop-shadow-sm" />
      </div>
      <h1
        className="text-[28px] font-bold tracking-tight"
        style={{ color: '#F5F7FB' }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className="text-sm mt-1.5"
          style={{ color: 'rgba(245, 247, 251, 0.55)' }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background:
          'linear-gradient(90deg, #22d3ee 0%, #a855f7 50%, #d946ef 100%)',
      }}
    >
      {children}
    </button>
  )
}

// ───── step 1: welcome

function WelcomeStep({
  email,
  bonusAmount,
  onContinue,
}: {
  email: string
  bonusAmount: number
  onContinue: () => void
}) {
  return (
    <>
      <StepHeader
        title={
          <>
            Welcome to{' '}
            <span
              style={{
                background: 'linear-gradient(90deg, #22d3ee, #d946ef)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Moboost
            </span>
          </>
        }
        subtitle={email ? `Signed in as ${email}` : 'Let\u2019s get you set up'}
      />
      <CardShell>
        <div className="space-y-5" style={{ color: '#F5F7FB' }}>
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.05))',
                border: '1px solid rgba(16,185,129,0.4)',
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: '#34D399' }} />
            </div>
            <div>
              <div className="font-semibold text-[15px]">
                {bonusAmount} free credits, on the house
              </div>
              <p
                className="text-[13px] mt-0.5 leading-relaxed"
                style={{ color: 'rgba(245,247,251,0.6)' }}
              >
                No card required. Use them to generate a lite report,
                competitive brief, or your first email sequence.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(34,211,238,0.05))',
                border: '1px solid rgba(34,211,238,0.4)',
              }}
            >
              <ArrowRight className="w-4 h-4" style={{ color: '#22d3ee' }} />
            </div>
            <div>
              <div className="font-semibold text-[15px]">
                One quick question
              </div>
              <p
                className="text-[13px] mt-0.5 leading-relaxed"
                style={{ color: 'rgba(245,247,251,0.6)' }}
              >
                Tell us what you want to promote so we can tailor the first
                report. Takes about 30 seconds.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <PrimaryButton onClick={onContinue}>
              Let&rsquo;s go <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </div>
      </CardShell>
    </>
  )
}

// ───── step 2: product info

function ProductStep({
  productName,
  setProductName,
  productUrl,
  setProductUrl,
  vertical,
  setVertical,
  description,
  setDescription,
  error,
  submitting,
  onBack,
  onSubmit,
}: {
  productName: string
  setProductName: (v: string) => void
  productUrl: string
  setProductUrl: (v: string) => void
  vertical: string
  setVertical: (v: string) => void
  description: string
  setDescription: (v: string) => void
  error: string | null
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: '#F5F7FB',
    borderRadius: '0.75rem',
    padding: '0.65rem 0.9rem',
    width: '100%',
    fontSize: '14px',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    color: '#F5F7FB',
    fontSize: '13px',
    fontWeight: 600,
    display: 'block',
    marginBottom: '0.35rem',
  }
  const optionalStyle: React.CSSProperties = {
    color: 'rgba(245,247,251,0.4)',
    fontSize: '12px',
    fontWeight: 500,
    marginLeft: '0.35rem',
  }

  return (
    <>
      <StepHeader
        title="What are you promoting?"
        subtitle="Just the basics — you can edit any of this later."
      />
      <CardShell>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="space-y-4"
        >
          <div>
            <label style={labelStyle}>
              Website URL or App Store / Play Store link
            </label>
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://yourbrand.com  or  https://apps.apple.com/..."
              style={inputStyle}
              autoFocus
              maxLength={500}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Product name <span style={optionalStyle}>Optional</span>
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Lucky Spin Casino"
              style={inputStyle}
              maxLength={120}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Vertical <span style={optionalStyle}>Optional</span>
            </label>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="">Select a category…</option>
              {VERTICALS.map((v) => (
                <option key={v} value={v} style={{ background: '#14162a' }}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              One-line description <span style={optionalStyle}>Optional</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes it different?"
              style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
              maxLength={1000}
              className="bg-transparent"
            />
          </div>

          {error && (
            <div
              className="text-[13px] rounded-lg px-3 py-2"
              style={{
                background: 'rgba(248,113,113,0.10)',
                border: '1px solid rgba(248,113,113,0.35)',
                color: '#FCA5A5',
              }}
            >
              {error}
            </div>
          )}

          <div className="pt-2 space-y-2">
            <PrimaryButton onClick={onSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up your account…
                </>
              ) : (
                <>
                  Finish setup <ArrowRight className="w-4 h-4" />
                </>
              )}
            </PrimaryButton>
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="w-full text-center text-[13px] py-2 transition-colors disabled:opacity-50"
              style={{ color: 'rgba(245,247,251,0.5)' }}
            >
              ← Back
            </button>
          </div>
        </form>
      </CardShell>
    </>
  )
}

// ───── step 3: done

function DoneStep({ bonusAmount }: { bonusAmount: number }) {
  return (
    <CardShell>
      <div className="text-center py-4" style={{ color: '#F5F7FB' }}>
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
          style={{
            background:
              'linear-gradient(135deg, rgba(16,185,129,0.30), rgba(16,185,129,0.10))',
            border: '1px solid rgba(16,185,129,0.5)',
          }}
        >
          <CheckCircle2 className="w-8 h-8" style={{ color: '#34D399' }} />
        </div>
        <h2 className="text-[22px] font-bold tracking-tight">
          You&rsquo;re all set
        </h2>
        <p
          className="text-sm mt-2"
          style={{ color: 'rgba(245,247,251,0.6)' }}
        >
          {bonusAmount} credits added to your account. Taking you to your
          workspace…
        </p>
        <div className="mt-5 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#22d3ee' }} />
        </div>
      </div>
    </CardShell>
  )
}
