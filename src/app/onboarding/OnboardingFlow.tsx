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
} from 'lucide-react'

// ──── Types ────

type Step = 'welcome' | 'product' | 'chat' | 'hybrid' | 'report' | 'done'
type Variant = 'form' | 'chat' | 'hybrid'

type ReportPhase =
  | 'scraping'     // Fetching website data
  | 'enriching'    // Analyzing product info
  | 'generating'   // Generating the report
  | 'done'         // Report ready
  | 'failed'       // Something went wrong

type Props = {
  initialEmail: string
  bonusAmount: number
  variant?: Variant  // A/B test variant — defaults to 'form'
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

// ──── Shared styles ────

const APPLE_BG = '#f5f5f7'
const APPLE_FONT =
  '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif'

const inputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d2d2d7',
  color: '#000000',
  borderRadius: '0.5rem',
  padding: '0.6rem 0.8rem',
  width: '100%',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  color: '#000000',
  fontSize: '13px',
  fontWeight: 600,
  display: 'block',
  marginBottom: '0.4rem',
}
const optionalStyle: React.CSSProperties = {
  color: '#999999',
  fontSize: '12px',
  fontWeight: 400,
  marginLeft: '0.3rem',
}

// ──────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────

export default function OnboardingFlow({
  initialEmail,
  bonusAmount,
  variant = 'form',
}: Props) {
  const router = useRouter()

  // Determine starting step based on variant
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
      // 1. Complete onboarding (creates product, grants credits, stamps onboarded_at)
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

      // 2. Create a project for this onboarding
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
          // Non-critical — project creation can fail silently
        }
      }

      // 3. Move to report generation step
      setStep('report')

      // 4. Trigger report generation
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
      // Phase 1: Scraping — simulate the website data collection phase
      // In reality, onboarding/complete already did the scrape, but we show
      // the progress to the user so it doesn't feel instant.
      await delay(1800)

      // Phase 2: Enriching — product analysis phase
      setReportPhase('enriching')
      await delay(2200)

      // Phase 3: Generating — the actual LLM report generation
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

  // Small delay helper for phased progress UX
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ── Navigation ──

  function goToReport() {
    if (reportId) {
      router.push(`/report/${reportId}`)
    }
  }

  function goToDashboard() {
    router.push('/')
  }

  function skipReport() {
    router.push('/')
  }

  // ── Render ──

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: APPLE_BG, fontFamily: APPLE_FONT }}
    >
      <div className="w-full max-w-[480px]">
        {/* Step indicator */}
        {step !== 'welcome' && (
          <StepIndicator
            current={step === 'report' || step === 'done' ? 3 : 2}
            total={3}
          />
        )}

        {step === 'welcome' && (
          <WelcomeStep
            email={initialEmail}
            bonusAmount={bonusAmount}
            onContinue={() => setStep(getProductStep())}
          />
        )}

        {/* Variant A: Form */}
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

        {/* Variant B: Chat */}
        {step === 'chat' && (
          <ProductChatStep
            onComplete={(url, name, vert, desc) => {
              setProductUrl(url)
              setProductName(name || '')
              setVertical(vert || '')
              setDescription(desc || '')
              // Trigger submit after setting state
              setTimeout(() => submitProduct(), 0)
            }}
            onBack={() => setStep('welcome')}
            submitting={submitting}
            error={error}
          />
        )}

        {/* Variant C: Hybrid (form + chat assist) */}
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

        {/* Report generation step (shared across all variants) */}
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
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Shared UI Components
// ──────────────────────────────────────────────────────────────────

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-8 border border-gray-200"
      style={{
        background: '#ffffff',
        boxShadow: 'rgba(0, 0, 0, 0.22) 3px 5px 30px',
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
    <div className="text-center mb-8">
      <h1
        className="text-[28px] font-bold tracking-tight mb-2"
        style={{ color: '#000000' }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-[15px]" style={{ color: '#555555' }}>
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
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[15px] font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: '#0071e3' }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background = '#0068d6'
      }}
      onMouseLeave={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background = '#0071e3'
      }}
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
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[15px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: '#f5f5f7', color: '#000000', border: '1px solid #d2d2d7' }}
    >
      {children}
    </button>
  )
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="h-1 rounded-full transition-all duration-300"
          style={{
            width: i + 1 === current ? '32px' : '16px',
            background: i + 1 <= current ? '#0071e3' : '#d2d2d7',
          }}
        />
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 1: Welcome (shared)
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
      <StepHeader
        title="Welcome to Moboost AI"
        subtitle={email ? `Signed in as ${email}` : "Let's get you set up"}
      />
      <CardShell>
        <div className="space-y-6" style={{ color: '#000000' }}>
          <div className="flex items-start gap-4">
            <div
              className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-lg inline-flex items-center justify-center"
              style={{ background: '#f0f4ff' }}
            >
              <Sparkles className="w-5 h-5" style={{ color: '#0071e3' }} />
            </div>
            <div>
              <div className="font-semibold text-[15px]">
                {bonusAmount} free credits, on the house
              </div>
              <p
                className="text-[13px] mt-1 leading-relaxed"
                style={{ color: '#555555' }}
              >
                No card required. Use them to generate your first marketing
                intelligence report.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div
              className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-lg inline-flex items-center justify-center"
              style={{ background: '#f0f4ff' }}
            >
              <FileText className="w-5 h-5" style={{ color: '#0071e3' }} />
            </div>
            <div>
              <div className="font-semibold text-[15px]">
                Your first report, in 30 seconds
              </div>
              <p
                className="text-[13px] mt-1 leading-relaxed"
                style={{ color: '#555555' }}
              >
                Tell us your product URL and we'll generate a market intelligence
                report with competitor analysis, audience insights, and creative
                recommendations.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <PrimaryButton onClick={onContinue}>
              Let's go <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </div>
      </CardShell>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 2A: Product Form (Variant A — original)
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
          <div>
            <label style={labelStyle}>
              Website URL or App Store / Play Store link
            </label>
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://yourbrand.com"
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
              style={{
                ...inputStyle,
                appearance: 'none',
                paddingRight: '2rem',
              }}
            >
              <option value="">Select a category</option>
              {VERTICALS.map((v) => (
                <option
                  key={v}
                  value={v}
                  style={{ background: '#ffffff', color: '#000000' }}
                >
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
              style={{
                ...inputStyle,
                minHeight: '70px',
                resize: 'vertical',
              }}
              maxLength={1000}
            />
          </div>

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
// Step 2B: Product Chat (Variant B — conversational)
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
      // Call intent detector to analyze the message
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
      // Fallback: try to extract URL with regex
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
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="rounded-xl px-4 py-2.5 max-w-[85%] text-[14px] leading-relaxed"
                  style={{
                    background:
                      msg.role === 'user' ? '#0071e3' : '#f0f0f3',
                    color: msg.role === 'user' ? '#ffffff' : '#000000',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div
                  className="rounded-xl px-4 py-2.5"
                  style={{ background: '#f0f0f3' }}
                >
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    style={{ color: '#555555' }}
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
              style={inputStyle}
              disabled={thinking || submitting}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || thinking || submitting}
              className="flex-shrink-0 w-10 h-10 rounded-lg inline-flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: '#0071e3' }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Confirm button when URL is extracted */}
          {extractedUrl && (
            <div className="pt-2 space-y-2">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]"
                style={{ background: '#e8f5e9', color: '#1b5e20' }}
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

  // When URL changes, auto-analyze
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
          <div>
            <label style={labelStyle}>
              Website URL or App Store / Play Store link
            </label>
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              onBlur={(e) => analyzeUrl(e.target.value)}
              placeholder="https://yourbrand.com"
              style={inputStyle}
              autoFocus
              maxLength={500}
            />
            {analyzing && (
              <div className="flex items-center gap-2 mt-2 text-[12px]" style={{ color: '#0071e3' }}>
                <Loader2 className="w-3 h-3 animate-spin" />
                AI is analyzing the URL…
              </div>
            )}
          </div>

          {aiHint && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-[13px]"
              style={{ background: '#f0f4ff', color: '#0071e3' }}
            >
              <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{aiHint}</span>
            </div>
          )}

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
              style={{
                ...inputStyle,
                appearance: 'none',
                paddingRight: '2rem',
              }}
            >
              <option value="">Select a category</option>
              {VERTICALS.map((v) => (
                <option
                  key={v}
                  value={v}
                  style={{ background: '#ffffff', color: '#000000' }}
                >
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
              style={{
                ...inputStyle,
                minHeight: '70px',
                resize: 'vertical',
              }}
              maxLength={1000}
            />
          </div>

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
// Step 3: Report Generation (shared across all variants)
// ──────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<ReportPhase, { title: string; subtitle: string }> = {
  scraping: {
    title: 'Fetching website data',
    subtitle: 'Scraping your product page for key information…',
  },
  enriching: {
    title: 'Analyzing your product',
    subtitle: 'Extracting value props, target audience, and competitive positioning…',
  },
  generating: {
    title: 'Generating your report',
    subtitle: 'Building market intelligence, competitor analysis, and creative recommendations…',
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

  // Pre-compute booleans for progress lines to avoid TS narrowing issues
  const scrapingDone = phase !== 'scraping'
  const enrichDone = phase === 'generating' || phase === 'done'
  const reportDone = phase === 'done'

  // Progress bar percentage
  const progressPct =
    phase === 'scraping' ? 15 :
    phase === 'enriching' ? 45 :
    phase === 'generating' ? 75 :
    phase === 'done' ? 100 : 0

  // Sub-status text for each phase
  const subStatus =
    phase === 'scraping' ? 'Fetching and parsing your website content...' :
    phase === 'enriching' ? 'Extracting product profile, value props, and audience signals...' :
    phase === 'generating' ? 'Building competitor landscape, market position, and creative recommendations...' :
    ''

  return (
    <>
      <StepHeader
        title={label.title}
        subtitle={label.subtitle}
      />
      <CardShell>
        <div className="space-y-6">
          {/* Progress indicator */}
          {isLoading && (
            <div className="space-y-5">
              {/* Animated progress steps */}
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

              {/* Progress bar */}
              <div className="space-y-2">
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: '#e5e5e7' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progressPct}%`,
                      background: 'linear-gradient(90deg, #0071e3, #34a853)',
                      transition: 'width 1.2s ease-in-out',
                    }}
                  />
                </div>
                <p
                  className="text-[12px] text-center"
                  style={{ color: '#888888' }}
                >
                  {subStatus}
                </p>
              </div>

              {/* Skip button */}
              <button
                type="button"
                onClick={onSkip}
                className="w-full text-center text-[13px] py-2 transition-colors hover:text-black"
                style={{ color: '#555555' }}
              >
                Skip for now — report will generate in the background
              </button>
            </div>
          )}

          {/* Success state */}
          {phase === 'done' && (
            <div className="space-y-4">
              {/* Completed progress bar */}
              <div className="space-y-3">
                <ProgressLine label="Website data" done active={false} />
                <ProgressLine label="Product analysis" done active={false} />
                <ProgressLine label="Market intelligence report" done active={false} />
              </div>

              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ background: '#e5e5e7' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: '100%',
                    background: '#34a853',
                    transition: 'width 0.5s ease-in-out',
                  }}
                />
              </div>

              <div className="flex justify-center">
                <div
                  className="w-14 h-14 rounded-2xl inline-flex items-center justify-center"
                  style={{ background: '#e8f5e9' }}
                >
                  <CheckCircle2
                    className="w-7 h-7"
                    style={{ color: '#34a853' }}
                  />
                </div>
              </div>

              <p
                className="text-center text-[14px] font-medium"
                style={{ color: '#1d1d1f' }}
              >
                Your report is ready!
              </p>

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
          <CheckCircle2 className="w-5 h-5" style={{ color: '#34a853' }} />
        ) : active ? (
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: '#0071e3' }}
          />
        ) : (
          <div
            className="w-5 h-5 rounded-full border-2"
            style={{ borderColor: '#d2d2d7' }}
          />
        )}
      </div>
      <div className="flex flex-col">
        <span
          className="text-[14px]"
          style={{
            color: done ? '#34a853' : active ? '#000000' : '#999999',
            fontWeight: active ? 600 : 400,
          }}
        >
          {label}
        </span>
        {active && detail && (
          <span
            className="text-[12px] mt-0.5"
            style={{ color: '#888888' }}
          >
            {detail}
          </span>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Step 4: Done (fallback — normally not reached)
// ──────────────────────────────────────────────────────────────────

function DoneStep({ bonusAmount }: { bonusAmount: number }) {
  return (
    <CardShell>
      <div className="text-center py-6" style={{ color: '#000000' }}>
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: '#e8f5e9' }}
        >
          <CheckCircle2 className="w-8 h-8" style={{ color: '#34a853' }} />
        </div>
        <h2 className="text-[22px] font-bold tracking-tight mb-2">
          You're all set
        </h2>
        <p className="text-[15px]" style={{ color: '#555555' }}>
          {bonusAmount} credits added to your account. Taking you to your
          workspace…
        </p>
        <div className="mt-6 flex justify-center">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: '#0071e3' }}
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
      className="text-[13px] rounded-lg px-3 py-2"
      style={{
        background: '#ffe5e5',
        border: '1px solid #ffc9c9',
        color: '#d32f2f',
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
      className="w-full text-center text-[13px] py-2 transition-colors disabled:opacity-50 hover:text-black"
      style={{ color: '#555555' }}
    >
      ← Back
    </button>
  )
}
