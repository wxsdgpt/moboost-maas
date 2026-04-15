'use client'

/**
 * /landing — Landing page builder.
 *
 * Flow:
 *   1. Pick a template from the 3 available options
 *   2. Click "Generate" to call /api/landing/generate
 *   3. Preview the generated HTML in an iframe
 *   4. Download or copy the HTML
 *
 * Context: uses /api/me to get productId, then generates against that product.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Layout,
  Sparkles,
  Download,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  ExternalLink,
  Rocket,
  Grid3X3,
  Star,
} from 'lucide-react'

type TemplateOption = {
  id: 'hero-cta' | 'feature-grid' | 'social-proof'
  name: string
  description: string
  icon: typeof Rocket
  preview: string
  colors: { bg: string; border: string; accent: string }
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'hero-cta',
    name: 'Hero + CTA',
    description: 'Bold hero section with a single strong CTA. Best for app downloads and sign-ups.',
    icon: Rocket,
    preview: '🚀',
    colors: { bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'text-emerald-700' },
  },
  {
    id: 'feature-grid',
    name: 'Feature Grid',
    description: 'Feature-focused layout with a grid of benefits. Best for showcasing product capabilities.',
    icon: Grid3X3,
    preview: '📊',
    colors: { bg: 'bg-indigo-50', border: 'border-indigo-200', accent: 'text-indigo-700' },
  },
  {
    id: 'social-proof',
    name: 'Social Proof',
    description: 'Trust-driven layout with testimonials and stats. Best for conversion optimization.',
    icon: Star,
    preview: '⭐',
    colors: { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'text-amber-700' },
  },
]

type GeneratedLanding = {
  templateId: string
  productName: string
  filledSlots: Array<{ slotId: string; content: string }>
  html: string
  generatedAt: string
  model: string
}

export default function LandingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [productId, setProductId] = useState<string | null>(null)
  const [productName, setProductName] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateOption>(TEMPLATES[0])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [landing, setLanding] = useState<GeneratedLanding | null>(null)
  const [landingId, setLandingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Load product context — prefer URL param, fallback to /api/me
  useEffect(() => {
    const urlProductId = searchParams.get('productId')
    const urlReportId = searchParams.get('reportId')
    if (urlReportId) setReportId(urlReportId)

    if (urlProductId) {
      setProductId(urlProductId)
      // Still fetch /api/me for product name
      fetch('/api/me')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setProductName(data.productInfo?.productName || null)
          }
        })
        .catch(() => {})
    } else {
      fetch('/api/me')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.productId) {
            setProductId(data.productId)
            setProductName(data.productInfo?.productName || null)
          }
        })
        .catch(() => {})
    }
  }, [searchParams])

  const handleGenerate = useCallback(async () => {
    if (!productId) {
      setError('Please complete onboarding first to set up your product.')
      return
    }

    setGenerating(true)
    setError(null)
    setLanding(null)

    try {
      const res = await fetch('/api/landing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          templateId: selectedTemplate.id,
          ...(reportId ? { reportId } : {}),
        }),
      })

      const data = await res.json()

      if (!data.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setLanding(data.landing)
      setLandingId(data.landingId)
      setShowPreview(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }, [productId, selectedTemplate.id])

  const handleCopyHtml = useCallback(() => {
    if (!landing?.html) return
    navigator.clipboard.writeText(landing.html).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [landing?.html])

  const handleDownload = useCallback(() => {
    if (!landing?.html) return
    const blob = new Blob([landing.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${landing.productName.replace(/\s+/g, '_').toLowerCase()}_landing_${selectedTemplate.id}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [landing, selectedTemplate.id])

  const handleOpenInNewTab = useCallback(() => {
    if (!landing?.html) return
    const blob = new Blob([landing.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }, [landing?.html])

  // Write HTML to iframe when landing changes
  useEffect(() => {
    if (landing?.html && iframeRef.current) {
      const doc = iframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(landing.html)
        doc.close()
      }
    }
  }, [landing?.html, showPreview])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex items-center gap-2">
              <Layout className="w-5 h-5 text-emerald-600" />
              <h1 className="text-lg font-bold text-gray-900">Landing Page Builder</h1>
            </div>
            {productName && (
              <span className="text-sm text-gray-400 ml-2">
                for {productName}
              </span>
            )}
          </div>
          {landing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyHtml}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy HTML'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
              <button
                onClick={handleOpenInNewTab}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Preview
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Show preview or template selection */}
        {showPreview && landing ? (
          <div>
            {/* Preview controls */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowPreview(false); setLanding(null) }}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to templates
                </button>
                <span className="text-sm text-gray-400">|</span>
                <span className="text-sm text-gray-500">
                  Generated with <span className="font-medium text-gray-700">{landing.model}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {new Date(landing.generatedAt).toLocaleString()}
                </span>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Regenerate
                </button>
              </div>
            </div>

            {/* Slot summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Generated Content Slots ({landing.filledSlots.length})
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {landing.filledSlots.map((slot) => (
                  <div key={slot.slotId} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="text-xs font-medium text-gray-600 mb-0.5">{slot.slotId}</div>
                    <div className="text-xs text-gray-400 truncate">{slot.content.slice(0, 60)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* HTML Preview iframe */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 bg-white rounded-md px-3 py-0.5 text-xs text-gray-400 ml-3">
                  {landing.productName.toLowerCase().replace(/\s+/g, '-')}.moboost.ai
                </div>
              </div>
              <iframe
                ref={iframeRef}
                title="Landing Page Preview"
                className="w-full border-0"
                style={{ height: '800px' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        ) : (
          <div>
            {/* Template Selection */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose a Template</h2>
              <p className="text-gray-500 text-sm">
                Select a layout style for your landing page. AI will generate all content based on your product data.
              </p>
            </div>

            {error && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {TEMPLATES.map((template) => {
                const Icon = template.icon
                const isSelected = selectedTemplate.id === template.id
                return (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`
                      relative text-left p-6 rounded-2xl border-2 transition-all
                      ${isSelected
                        ? `${template.colors.bg} ${template.colors.border} ring-2 ring-offset-2 ring-emerald-300`
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'}
                    `}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3">
                        <Check className="w-5 h-5 text-emerald-500" />
                      </div>
                    )}
                    <div className="text-3xl mb-3">{template.preview}</div>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-4 h-4 ${isSelected ? template.colors.accent : 'text-gray-400'}`} />
                      <h3 className={`font-bold ${isSelected ? template.colors.accent : 'text-gray-900'}`}>
                        {template.name}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {template.description}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Generate button */}
            <div className="text-center">
              <button
                onClick={handleGenerate}
                disabled={generating || !productId}
                className={`
                  inline-flex items-center gap-2 px-8 py-3 rounded-xl text-base font-bold transition-all
                  ${generating || !productId
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-200 hover:shadow-xl hover:shadow-emerald-200'}
                `}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating landing page...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Landing Page
                  </>
                )}
              </button>
              {!productId && (
                <p className="mt-3 text-sm text-gray-400">
                  Complete onboarding to set up your product first.{' '}
                  <a href="/onboarding" className="text-emerald-600 hover:underline">Go to onboarding →</a>
                </p>
              )}
              {productId && !generating && (
                <p className="mt-3 text-sm text-gray-400">
                  Using template: <span className="font-medium">{selectedTemplate.name}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
