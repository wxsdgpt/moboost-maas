'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  FileText,
  Eye,
  LayoutDashboard,
  Send,
  Globe,
  Sparkles,
  Gift,
  Zap,
} from 'lucide-react'

// ──── Types ────

type Step = 'welcome' | 'product' | 'chat' | 'hybrid' | 'report' | 'done'
type Variant = 'form' | 'chat' | 'hybrid'

type ReportPhase =
  | 'scraping'
  | 'enriching'
  | 'generating'
  | 'done'
  | 'failed'

type Props = {
  initialEmail: string
  bonusAmount: number
  variant?: Variant
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

// ──────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────

export default function OnboardingFlow({
  initialEmail,
  bonusAmount,
  variant = 'form',
}: Props) {
  const router = useRouter()

  const getProductStep = (): Step => {
    if (variant === 'chat') return 'chat'
    if (variant === 'hybrid') return 'hybrid'
    return 'product'
  }

  const [step, setStep] = useState<Step>('welcome')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Product info (shared across variants)
  const [productName, setProductName] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [vertical, setVertical] = useState('')
  const [description, setDescription] = useState('')

  // Report generation state
  const [reportPhase, setReportPhase] = useState<ReportPhase>('scraping')
  const [reportId, setReportId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  // Animate key to re-trigger entrance animation on step change
  const [animKey, setAnimKey] = useState(0)
  useEffect(() => { setAnimKey(k => k + 1) }, [step])

  // ── Submit product info → create project → trigger report ──

  async function submitProduct() {
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
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `request_failed_${res.status}`)
      }

      const newProductId = data.productId
      setProductId(newProductId)

      if (newProductId) {
        try {
          const projRes = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: productName.trim() || url,
              productId: newProductId,
              source: 'onboarding',
            }),
          })
          const projData = await projRes.json()
          if (projData.ok) {
            setProjectId(projData.project.id)
          }
        } catch {
          // Non-critical
        }
      }

      setStep('report')

      if (newProductId) {
        generateReport(newProductId)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Report generation with polling ──

  async function generateReport(prodId: string) {
    setReportPhase('scraping')
    setReportError(null)

    try {
      await delay(1800)
      setReportPhase('enriching')
      await delay(2200)
      setReportPhase('generating')

      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: prodId, kind: 'lite' }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Report generation failed')
      }

      setReportId(data.reportId)
      setReportPhase('done')
    } catch (e) {
      setReportPhase('failed')
      setReportError((e as Error).message)
    }
  }

  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ── Navigation ──

  function goToReport() {
    if (reportId) router.push(`/report/${reportId}`)
  }
  function goToDashboard() { router.push('/') }
  function skipReport() { router.push('/') }

  // ── Step number for indicator ──
  const stepNum =
    step === 'welcome' ? 1 :
    step === 'report' || step === 'done' ? 3 : 2

  // ── Render ──

  return (
    <div
      className="ob-bg relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden"
      style={{
        fontFamily:
          '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Floating background orbs */}
      <div className="ob-orb-1" style={{ top: '10%', left: '-5%' }} />
      <div className="ob-orb-2" style={{ bottom: '5%', right: '-3%' }} />

      <div className="w-full max-w-[480px] relative z-10">
        {/* Step indicator — always visible */}
        <StepIndicator current={stepNum} />

        {/* Animated step container */}
        <div key={animKey} className="ob-step-enter">
          {step === 'welcome' && (
            <WelcomeStep
              email={initialEmail}
              bonusAmount={bonusAmount}
              onContinue={() => setStep(getProductStep())}
            />
          )}

          {step === 'product' && (
            <ProductFormStep
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
              onSubmit={submitProduct}
            />
          )}

          {step === 'chat' && (
            <ProductChatStep
              onComplete={(url, name, vert, desc) => {
                setProductUrl(url)
                setProductName(name || '')
                setVertical(vert || '')
                setDescription(desc || '')
                setTimeout(() => submitProduct(), 0)
              }}
              onBack={() => setStep('welcome')}
              submitting={submitting}
              error={error}
            />
          )}

          {step === 'hybrid' && (
            <ProductHybridStep
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
              onSubmit={submitProduct}
            />
          )}

          {step === 'report' && (
            <ReportStep
              phase={reportPhase}
              reportId={reportId}
              reportError={reportError}
              onViewReport={goToReport}
              onGoDashboard={goToDashboard}
              onSkip={skipReport}
              onRetry={() => productId && generateReport(productId)}
            />
          )}

          {step === 'done' && <DoneStep bonusAmount={bonusAmount} />}
        </div>

        {/* Subtle footer */}
        <p
          className="text-center mt-8 text-[12px]"
          style={{ color: 'var(--text-3)' }}
        >
          Powered by Moboost AI
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Shared UI Components
// ──────────────────────────────────────────────────────────────────

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ob-card p-8">
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
    <div className="text-center mb-8">
      <h1
        className="text-[28px] font-bold tracking-tight mb-2"
        style={{ color: 'var(--text-1)' }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
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
      className="ob-btn-primary"
    >
      {children}
    </button>
  )
}

function SecondaryButton({
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
      className="ob-btn-secondary"
    >
      {children}
    </button>
  )
}

function StepIndicator({ current }: { current: number }) {
  const labels = ['Welcome', 'Product', 'Report']
  return (
    <div className="ob-steps mb-8">
      {labels.map((label, i) => {
        const num = i + 1
        const isDone = num < current
        const isActive = num === current
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`ob-step-line ${isDone ? 'done' : 'pending'}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`ob-step-dot ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  num
                )}
              </div>
              <span
                className="text-[11px] font-medium"
                style={{
                  color: isDone ? 'var(--brand)' : isActive ? 'var(--brand)' : 'var(--text-3)',
                }}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 1: Welcome
// ──────────────────────────────────────────────────────────────────

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
      <CardShell>
        <div className="space-y-7">
          {/* Hero icon */}
          <div className="flex justify-center">
            <div className="ob-sparkle-hero">
              <Sparkles className="w-8 h-8" style={{ color: 'var(--bg)' }} />
            </div>
          </div>

          <div className="text-center">
            <h1
              className="text-[28px] font-bold tracking-tight mb-2"
              style={{ color: 'var(--text-1)' }}
            >
              Welcome to Moboost AI
            </h1>
            {email && (
              <p className="text-[14px]" style={{ color: 'var(--text-3)' }}>
                {email}
              </p>
            )}
          </div>

          {/* Feature cards */}
          <div className="space-y-4">
            <FeatureRow
              icon={<Zap className="w-5 h-5" style={{ color: 'var(--brand)' }} />}
              title={`${bonusAmount} free credits, on the house`}
              desc="No card required. Use them to generate your first marketing intelligence report."
            />
            <FeatureRow
              icon={<FileText className="w-5 h-5" style={{ color: 'var(--brand)' }} />}
              title="Your first report, in 30 seconds"
              desc="Tell us your product URL and we'll generate a market intelligence report with competitor analysis, audience insights, and creative recommendations."
            />
          </div>

          <div className="pt-2">
            <PrimaryButton onClick={onContinue}>
              Get started <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </div>
      </CardShell>
    </>
  )
}

function FeatureRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="ob-icon-box mt-0.5">{icon}</div>
      <div>
        <div
          className="font-semibold text-[15px]"
          style={{ color: 'var(--text-1)' }}
        >
          {title}
        </div>
        <p
          className="text-[13px] mt-1 leading-relaxed"
          style={{ color: 'var(--text-3)' }}
        >
          {desc}
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 2A: Product Form (Variant A)
// ──────────────────────────────────────────────────────────────────

function ProductFormStep({
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
          className="space-y-5"
        >
          <FormField label="Website URL or App Store / Play Store link">
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://yourbrand.com"
              className="ob-input"
              autoFocus
              maxLength={500}
            />
          </FormField>

          <FormField label="Product name" optional>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Lucky Spin Casino"
              className="ob-input"
              maxLength={120}
            />
          </FormField>

          <FormField label="Vertical" optional>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="ob-input"
              style={{ appearance: 'none', paddingRight: '2rem' }}
            >
              <option value="">Select a category</option>
              {VERTICALS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </FormField>

          <FormField label="One-line description" optional>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes it different?"
              className="ob-input"
              style={{ minHeight: '70px', resize: 'vertical' }}
              maxLength={1000}
            />
          </FormField>

          {error && <ErrorBanner message={error} />}

          <div className="pt-2 space-y-3">
            <PrimaryButton onClick={onSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up your account…
                </>
              ) : (
                <>
                  Generate my report <ArrowRight className="w-4 h-4" />
                </>
              )}
            </PrimaryButton>
            <BackButton onClick={onBack} disabled={submitting} />
          </div>
        </form>
      </CardShell>
    </>
  )
}

function FormField({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[13px] font-semibold"
        style={{ color: 'var(--text-2)' }}
      >
        {label}
        {optional && (
          <span
            className="font-normal ml-1.5"
            style={{ color: 'var(--text-3)', fontSize: '12px' }}
          >
            Optional
          </span>
        )}
      </label>
      {children}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 2B: Product Chat (Variant B)
// ──────────────────────────────────────────────────────────────────

type ChatMessage = {
  role: 'assistant' | 'user'
  content: string
}

function ProductChatStep({
  onComplete,
  onBack,
  submitting,
  error,
}: {
  onComplete: (
    url: string,
    name?: string,
    vertical?: string,
    description?: string
  ) => void
  onBack: () => void
  submitting: boolean
  error: string | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm here to help set up your first report. What product or brand would you like to analyze? You can share a URL, a name, or just describe what you're promoting.",
    },
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null)
  const [extractedName, setExtractedName] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || thinking) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setThinking(true)

    try {
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: userMsg,
          context: { previousMessages: messages },
        }),
      })
      const data = await res.json()
      const intent = data.intent

      if (intent?.urls?.length > 0) {
        const url = intent.urls[0]
        setExtractedUrl(url)
        if (intent.productName) setExtractedName(intent.productName)

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Great! I found the URL: ${url}${intent.productName ? ` (${intent.productName})` : ''}. Ready to generate your first report?`,
          },
        ])
      } else if (intent?.needsUrl) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              intent.clarificationQuestion ||
              "Could you share the website URL or app store link for the product you'd like to analyze?",
          },
        ])
      } else if (intent?.searchSuggestions?.length > 0) {
        if (intent.productName) setExtractedName(intent.productName)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `I understand you want to analyze "${intent.productName || userMsg}". Could you provide the website URL so I can generate a detailed report?`,
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              "I'd love to help! Could you tell me what product or brand you want to promote? A website URL works best, but a name or description is fine too.",
          },
        ])
      }
    } catch {
      const urlMatch = userMsg.match(/https?:\/\/[^\s]+/i)
      if (urlMatch) {
        setExtractedUrl(urlMatch[0])
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Got it! I found the URL: ${urlMatch[0]}. Shall I generate your first report?`,
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Could you share the website URL for the product you want to analyze?',
          },
        ])
      }
    } finally {
      setThinking(false)
    }
  }

  function handleConfirm() {
    if (extractedUrl) {
      onComplete(extractedUrl, extractedName || undefined)
    }
  }

  return (
    <>
      <StepHeader
        title="Tell us about your product"
        subtitle="Chat with AI to set up your first report"
      />
      <CardShell>
        <div className="space-y-4">
          {/* Messages area */}
          <div
            className="space-y-3 max-h-[300px] overflow-y-auto pr-1"
            style={{ scrollbarWidth: 'thin' }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ob-bubble-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="rounded-2xl px-4 py-2.5 max-w-[85%] text-[14px] leading-relaxed"
                  style={{
                    background:
                      msg.role === 'user'
                        ? 'linear-gradient(135deg, var(--brand), #a8d44a)'
                        : 'var(--surface-3)',
                    color: msg.role === 'user' ? 'var(--bg)' : 'var(--text-1)',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start ob-bubble-in">
                <div
                  className="rounded-2xl px-4 py-2.5"
                  style={{ background: 'var(--surface-3)' }}
                >
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    style={{ color: 'var(--text-3)' }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a URL or describe your product…"
              className="ob-input"
              disabled={thinking || submitting}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || thinking || submitting}
              className="flex-shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, var(--brand), #a8d44a)' }}
            >
              <Send className="w-4 h-4" style={{ color: 'var(--bg)' }} />
            </button>
          </div>

          {/* Confirm button when URL is extracted */}
          {extractedUrl && (
            <div className="pt-2 space-y-3">
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] font-medium"
                style={{
                  background: 'var(--brand-light)',
                  color: 'var(--brand)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <Globe className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{extractedUrl}</span>
              </div>
              <PrimaryButton onClick={handleConfirm} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up…
                  </>
                ) : (
                  <>
                    Generate my report <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </PrimaryButton>
            </div>
          )}

          {error && <ErrorBanner message={error} />}

          <BackButton onClick={onBack} disabled={thinking || submitting} />
        </div>
      </CardShell>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 2C: Hybrid (Variant C — form with AI assist)
// ──────────────────────────────────────────────────────────────────

function ProductHybridStep({
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
  const [aiHint, setAiHint] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const analyzeUrl = useCallback(async (url: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return
    setAnalyzing(true)
    setAiHint(null)
    try {
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: url }),
      })
      const data = await res.json()
      if (data.intent?.productName && !productName) {
        setProductName(data.intent.productName)
        setAiHint(
          `AI detected: "${data.intent.productName}". Feel free to edit.`
        )
      }
    } catch {
      // Silently fail
    } finally {
      setAnalyzing(false)
    }
  }, [productName, setProductName])

  return (
    <>
      <StepHeader
        title="What are you promoting?"
        subtitle="Paste a URL and AI will help fill in the rest."
      />
      <CardShell>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="space-y-5"
        >
          <FormField label="Website URL or App Store / Play Store link">
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              onBlur={(e) => analyzeUrl(e.target.value)}
              placeholder="https://yourbrand.com"
              className="ob-input"
              autoFocus
              maxLength={500}
            />
            {analyzing && (
              <div
                className="flex items-center gap-2 mt-2 text-[12px]"
                style={{ color: 'var(--brand)' }}
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                AI is analyzing the URL…
              </div>
            )}
          </FormField>

          {aiHint && (
            <div
              className="flex items-start gap-2 px-4 py-3 rounded-xl text-[13px] font-medium"
              style={{
                background: 'linear-gradient(135deg, var(--brand-light), transparent)',
                color: 'var(--brand)',
                border: '1px solid var(--border-strong)',
              }}
            >
              <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{aiHint}</span>
            </div>
          )}

          <FormField label="Product name" optional>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Lucky Spin Casino"
              className="ob-input"
              maxLength={120}
            />
          </FormField>

          <FormField label="Vertical" optional>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="ob-input"
              style={{ appearance: 'none', paddingRight: '2rem' }}
            >
              <option value="">Select a category</option>
              {VERTICALS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </FormField>

          <FormField label="One-line description" optional>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes it different?"
              className="ob-input"
              style={{ minHeight: '70px', resize: 'vertical' }}
              maxLength={1000}
            />
          </FormField>

          {error && <ErrorBanner message={error} />}

          <div className="pt-2 space-y-3">
            <PrimaryButton onClick={onSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up your account…
                </>
              ) : (
                <>
                  Generate my report <ArrowRight className="w-4 h-4" />
                </>
              )}
            </PrimaryButton>
            <BackButton onClick={onBack} disabled={submitting} />
          </div>
        </form>
      </CardShell>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 3: Report Generation
// ──────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<ReportPhase, { title: string; subtitle: string }> = {
  scraping: {
    title: 'Fetching website data',
    subtitle: 'Scraping your product page for key information…',
  },
  enriching: {
    title: 'Analyzing your product',
    subtitle: 'Extracting value props, audience, and competitive positioning…',
  },
  generating: {
    title: 'Generating your report',
    subtitle: 'Building market intelligence and creative recommendations…',
  },
  done: {
    title: 'Your report is ready!',
    subtitle: 'We\'ve analyzed your product and generated actionable insights.',
  },
  failed: {
    title: 'Report generation failed',
    subtitle: 'Something went wrong, but you can still explore the platform.',
  },
}

function ReportStep({
  phase,
  reportId,
  reportError,
  onViewReport,
  onGoDashboard,
  onSkip,
  onRetry,
}: {
  phase: ReportPhase
  reportId: string | null
  reportError: string | null
  onViewReport: () => void
  onGoDashboard: () => void
  onSkip: () => void
  onRetry: () => void
}) {
  const label = PHASE_LABELS[phase]
  const isLoading = phase === 'scraping' || phase === 'enriching' || phase === 'generating'

  const scrapingDone = phase !== 'scraping'
  const enrichDone = phase === 'generating' || phase === 'done'
  const reportDone = phase === 'done'

  const progressPct =
    phase === 'scraping' ? 15 :
    phase === 'enriching' ? 45 :
    phase === 'generating' ? 75 :
    phase === 'done' ? 100 : 0

  return (
    <>
      <StepHeader title={label.title} subtitle={label.subtitle} />
      <CardShell>
        <div className="space-y-6">
          {/* Progress indicator */}
          {isLoading && (
            <div className="space-y-5">
              <div className="space-y-3">
                <ProgressLine
                  label="Website data"
                  detail="Scraping page structure, meta tags, and content"
                  done={scrapingDone}
                  active={phase === 'scraping'}
                />
                <ProgressLine
                  label="Product analysis"
                  detail="Identifying verticals, features, and audience"
                  done={enrichDone}
                  active={phase === 'enriching'}
                />
                <ProgressLine
                  label="Market intelligence report"
                  detail="Competitor landscape, geo hotspots, and creative patterns"
                  done={reportDone}
                  active={phase === 'generating'}
                />
              </div>

              {/* Animated progress bar */}
              <div className="ob-progress-bar">
                <div
                  className="ob-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Skip */}
              <button
                type="button"
                onClick={onSkip}
                className="w-full text-center text-[13px] py-2 transition-colors"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'
                }}
              >
                Skip — report will generate in the background
              </button>
            </div>
          )}

          {/* Success state */}
          {phase === 'done' && (
            <div className="space-y-5">
              <div className="space-y-3">
                <ProgressLine label="Website data" done active={false} />
                <ProgressLine label="Product analysis" done active={false} />
                <ProgressLine label="Market intelligence report" done active={false} />
              </div>

              {/* Completed bar */}
              <div className="ob-progress-bar">
                <div
                  className="h-full rounded-[3px]"
                  style={{
                    width: '100%',
                    background: 'var(--brand)',
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>

              {/* Success icon */}
              <div className="flex justify-center">
                <div
                  className="ob-check-pop w-16 h-16 rounded-2xl inline-flex items-center justify-center"
                  style={{ background: 'var(--brand-light)' }}
                >
                  <CheckCircle2
                    className="w-8 h-8"
                    style={{ color: 'var(--brand)' }}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <PrimaryButton onClick={onViewReport}>
                  <Eye className="w-4 h-4" />
                  View Report
                </PrimaryButton>
                <SecondaryButton onClick={onGoDashboard}>
                  <LayoutDashboard className="w-4 h-4" />
                  Go to Dashboard
                </SecondaryButton>
              </div>
            </div>
          )}

          {/* Failed state */}
          {phase === 'failed' && (
            <div className="space-y-4">
              {reportError && <ErrorBanner message={reportError} />}
              <div className="space-y-3">
                <PrimaryButton onClick={onRetry}>
                  Try again
                </PrimaryButton>
                <SecondaryButton onClick={onGoDashboard}>
                  <LayoutDashboard className="w-4 h-4" />
                  Go to Dashboard
                </SecondaryButton>
              </div>
            </div>
          )}
        </div>
      </CardShell>
    </>
  )
}

function ProgressLine({
  label,
  detail,
  done,
  active,
}: {
  label: string
  detail?: string
  done: boolean
  active: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-5 h-5 mt-0.5">
        {done ? (
          <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--brand)' }} />
        ) : active ? (
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: 'var(--brand)' }}
          />
        ) : (
          <div
            className="w-5 h-5 rounded-full border-2"
            style={{ borderColor: 'var(--border-strong)' }}
          />
        )}
      </div>
      <div className="flex flex-col">
        <span
          className="text-[14px] transition-all duration-300"
          style={{
            color: done ? 'var(--brand)' : active ? 'var(--text-1)' : 'var(--text-3)',
            fontWeight: active ? 600 : 400,
          }}
        >
          {label}
        </span>
        {active && detail && (
          <span
            className="text-[12px] mt-0.5"
            style={{ color: 'var(--text-3)' }}
          >
            {detail}
          </span>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 4: Done (fallback)
// ──────────────────────────────────────────────────────────────────

function DoneStep({ bonusAmount }: { bonusAmount: number }) {
  return (
    <CardShell>
      <div className="text-center py-6">
        <div className="ob-check-pop inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: 'var(--brand-light)' }}
        >
          <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--brand)' }} />
        </div>
        <h2
          className="text-[22px] font-bold tracking-tight mb-2"
          style={{ color: 'var(--text-1)' }}
        >
          You're all set
        </h2>
        <p className="text-[15px]" style={{ color: 'var(--text-3)' }}>
          {bonusAmount} credits added to your account. Taking you to your
          workspace…
        </p>
        <div className="mt-6 flex justify-center">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: 'var(--brand)' }}
          />
        </div>
      </div>
    </CardShell>
  )
}

// ──────────────────────────────────────────────────────────────────
// Shared small components
// ──────────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="text-[13px] rounded-xl px-4 py-3 font-medium"
      style={{
        background: 'rgba(255, 82, 82, 0.08)',
        border: '1px solid rgba(255, 82, 82, 0.15)',
        color: '#ff6b6b',
      }}
    >
      {message}
    </div>
  )
}

function BackButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-center text-[13px] font-medium py-2 transition-colors disabled:opacity-50"
      style={{ color: 'var(--text-3)' }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'
      }}
    >
      ← Back
    </button>
  )
}
