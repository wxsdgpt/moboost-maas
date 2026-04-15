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

import { useState, useEffect, useCallback } from 'react'
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
    colors: { bg: 'bg-white', border: 'border-blue-200', accent: 'text-blue-600' },
  },
  {
    id: 'feature-grid',
    name: 'Feature Grid',
    description: 'Feature-focused layout with a grid of benefits. Best for showcasing product capabilities.',
    icon: Grid3X3,
    preview: '📊',
    colors: { bg: 'bg-white', border: 'border-blue-200', accent: 'text-blue-600' },
  },
  {
    id: 'social-proof',
    name: 'Social Proof',
    description: 'Trust-driven layout with testimonials and stats. Best for conversion optimization.',
    icon: Star,
    preview: '⭐',
    colors: { bg: 'bg-white', border: 'border-blue-200', accent: 'text-blue-600' },
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

  // iframe now uses srcDoc — no manual write needed

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b px-6 py-4" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'rgba(0,0,0,0.48)', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f7'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Layout className="w-5 h-5" style={{ color: '#0071e3' }} />
              <h1 className="text-lg font-bold" style={{ color: '#000' }}>Landing Page Builder</h1>
            </div>
            {productName && (
              <span className="text-sm ml-2" style={{ color: 'rgba(0,0,0,0.48)' }}>
                for {productName}
              </span>
            )}
          </div>
          {landing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyHtml}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors border"
                style={{
                  color: '#000',
                  borderColor: 'rgba(0,0,0,0.1)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {copied ? <Check className="w-3.5 h-3.5" style={{ color: '#0071e3' }} /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy HTML'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors border"
                style={{
                  color: '#000',
                  borderColor: 'rgba(0,0,0,0.1)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
              <button
                onClick={handleOpenInNewTab}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={{
                  color: 'white',
                  backgroundColor: '#0071e3',
                }}
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
                  className="text-sm flex items-center gap-1 transition-colors"
                  style={{ color: 'rgba(0,0,0,0.48)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#000'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(0,0,0,0.48)'}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to templates
                </button>
                <span className="text-sm" style={{ color: 'rgba(0,0,0,0.1)' }}>|</span>
                <span className="text-sm" style={{ color: 'rgba(0,0,0,0.48)' }}>
                  Generated with <span className="font-medium" style={{ color: '#000' }}>{landing.model}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'rgba(0,0,0,0.48)' }}>
                  {new Date(landing.generatedAt).toLocaleString()}
                </span>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border"
                  style={{
                    color: '#0071e3',
                    borderColor: '#0071e3',
                    backgroundColor: 'rgba(0,113,227,0.05)',
                    opacity: generating ? 0.5 : 1,
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Regenerate
                </button>
              </div>
            </div>

            {/* Slot summary */}
            <div className="bg-white rounded-lg border p-4 mb-4" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(0,0,0,0.48)' }}>
                Generated Content Slots ({landing.filledSlots.length})
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {landing.filledSlots.map((slot) => (
                  <div key={slot.slotId} className="px-3 py-2 rounded-lg border" style={{ backgroundColor: '#f5f5f7', borderColor: 'rgba(0,0,0,0.1)' }}>
                    <div className="text-xs font-medium mb-0.5" style={{ color: '#000' }}>{slot.slotId}</div>
                    <div className="text-xs truncate" style={{ color: 'rgba(0,0,0,0.48)' }}>{slot.content.slice(0, 60)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* HTML Preview iframe */}
            <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(0,0,0,0.1)', boxShadow: '0 3px 5px 30px rgba(0,0,0,0.08)' }}>
              <div className="px-4 py-2 border-b flex items-center gap-2" style={{ backgroundColor: '#f5f5f7', borderColor: 'rgba(0,0,0,0.1)' }}>
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#d70015' }} />
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f5a623' }} />
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#34c759' }} />
                </div>
                <div className="flex-1 bg-white rounded-md px-3 py-0.5 text-xs ml-3" style={{ color: 'rgba(0,0,0,0.48)' }}>
                  {landing.productName.toLowerCase().replace(/\s+/g, '-')}.moboost.ai
                </div>
              </div>
              <iframe
                title="Landing Page Preview"
                srcDoc={landing.html}
                className="w-full border-0"
                style={{ height: '800px' }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        ) : (
          <div>
            {/* Template Selection */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#000' }}>Choose a Template</h2>
              <p className="text-sm" style={{ color: 'rgba(0,0,0,0.48)' }}>
                Select a layout style for your landing page. AI will generate all content based on your product data.
              </p>
            </div>

            {error && (
              <div className="mb-6 px-4 py-3 rounded-lg border text-sm" style={{ color: '#d70015', borderColor: 'rgba(215,0,21,0.2)', backgroundColor: 'rgba(215,0,21,0.06)' }}>
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
                    className="relative text-left p-6 rounded-lg border-2 transition-all"
                    style={{
                      backgroundColor: isSelected ? 'white' : 'white',
                      borderColor: isSelected ? '#0071e3' : 'rgba(0,0,0,0.1)',
                      boxShadow: isSelected ? '0 3px 5px 30px rgba(0,113,227,0.15)' : '0 3px 5px 30px rgba(0,0,0,0.08)',
                    }}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3">
                        <Check className="w-5 h-5" style={{ color: '#0071e3' }} />
                      </div>
                    )}
                    <div className="text-3xl mb-3">{template.preview}</div>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4" style={{ color: isSelected ? '#0071e3' : 'rgba(0,0,0,0.48)' }} />
                      <h3 className="font-bold" style={{ color: isSelected ? '#0071e3' : '#000' }}>
                        {template.name}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(0,0,0,0.48)' }}>
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
                className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-base font-bold transition-all"
                style={{
                  backgroundColor: generating || !productId ? '#f5f5f7' : '#0071e3',
                  color: generating || !productId ? 'rgba(0,0,0,0.3)' : 'white',
                  cursor: generating || !productId ? 'not-allowed' : 'pointer',
                  boxShadow: generating || !productId ? 'none' : '0 3px 5px 30px rgba(0,113,227,0.3)',
                }}
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
                <p className="mt-3 text-sm" style={{ color: 'rgba(0,0,0,0.48)' }}>
                  Complete onboarding to set up your product first.{' '}
                  <a href="/onboarding" className="transition-colors" style={{ color: '#0071e3' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
                    Go to onboarding →
                  </a>
                </p>
              )}
              {productId && !generating && (
                <p className="mt-3 text-sm" style={{ color: 'rgba(0,0,0,0.48)' }}>
                  Using template: <span className="font-medium" style={{ color: '#000' }}>{selectedTemplate.name}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
