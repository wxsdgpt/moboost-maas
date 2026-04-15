'use client'

/**
 * /brief/execute — Execute a campaign brief with REAL asset generation.
 *
 * Flow per audience group:
 *   1. Show ModelRouter animation (selecting best model)
 *   2. Call /api/generate to create actual image via Gemini
 *   3. Call /api/brief/execute for landing page HTML
 *   4. Display results: image + landing page preview
 *
 * Apple-inspired design (DESIGN.md).
 */

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Loader2, CheckCircle2, ExternalLink, Copy, Download,
  Film, FileText, MapPin, Brain, Check, Cpu, Sparkles,
  ArrowRight, Play, Eye,
} from 'lucide-react'
import type { AudienceGroup } from '@/lib/reportTypes'

const C = {
  black: '#000000',
  nearBlack: '#1d1d1f',
  lightGray: '#f5f5f7',
  blue: '#0071e3',
  brightBlue: '#2997ff',
  white: '#ffffff',
  text80: 'rgba(0,0,0,0.8)',
  text48: 'rgba(0,0,0,0.48)',
}

/* ── Thinking Steps for generation process ── */
const ASSET_STEPS = [
  { id: '1', label: 'Analyzing audience profile', detail: 'Understanding demographics, interests, behavior' },
  { id: '2', label: 'Matching creative direction', detail: 'Selecting optimal format and visual style' },
  { id: '3', label: 'Selecting best model', detail: 'Routing to highest-match AI model' },
  { id: '4', label: 'Generating prompt', detail: 'Building optimized generation prompt' },
  { id: '5', label: 'Calling generation API', detail: 'Sending to NanoBanana Pro / VEO 3.1' },
  { id: '6', label: 'Rendering asset', detail: 'AI model is creating your visual' },
]

const LANDING_STEPS = [
  { id: '1', label: 'Analyzing selling point', detail: 'Extracting key messages for this audience' },
  { id: '2', label: 'Matching creative style', detail: 'Ensuring landing page matches asset visual' },
  { id: '3', label: 'Building page structure', detail: 'Hero, features, social proof, CTA sections' },
  { id: '4', label: 'Generating HTML', detail: 'Creating responsive, self-contained page' },
]

/* ── Model candidates for mini router display ── */
const IMAGE_MODELS = [
  { name: 'NanoBanana Pro', score: 96, speed: '~8s' },
  { name: 'Midjourney V6', score: 88, speed: '~15s' },
  { name: 'SDXL Turbo', score: 72, speed: '~3s' },
]

type GroupStatus = 'pending' | 'routing' | 'generating_asset' | 'generating_landing' | 'done' | 'error'

type GroupResult = {
  imageData?: string
  imagePrompt?: string
  creative?: {
    headline: string
    bodyCopy: string
    ctaText: string
    format: string
    visualDescription: string
  }
  landingPageHtml?: string
  error?: string
}

export default function BriefExecutePage() {
  const params = useSearchParams()
  const productId = params.get('productId')
  const reportId = params.get('reportId')

  const [phase, setPhase] = useState<'loading' | 'ready' | 'executing' | 'done' | 'error'>('loading')
  const [groups, setGroups] = useState<AudienceGroup[]>([])
  const [groupStatuses, setGroupStatuses] = useState<GroupStatus[]>([])
  const [groupResults, setGroupResults] = useState<GroupResult[]>([])
  const [currentGroupIdx, setCurrentGroupIdx] = useState(-1)
  const [currentStep, setCurrentStep] = useState(0)
  const [currentPhase, setCurrentPhase] = useState<'asset' | 'landing'>('asset')
  const [productName, setProductName] = useState('')
  const [error, setError] = useState('')
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)

  // Load report and extract brief
  useEffect(() => {
    if (!productId || !reportId) {
      setError('Missing productId or reportId')
      setPhase('error')
      return
    }

    async function loadBrief() {
      try {
        const res = await fetch(`/api/reports/${reportId}`)
        if (!res.ok) throw new Error('Failed to load report')
        const data = await res.json()
        const brief = data.report?.output?.brief

        if (!brief?.audienceGroups?.length) {
          throw new Error('No brief found. Please generate a full report first.')
        }

        setGroups(brief.audienceGroups)
        setProductName(brief.productName || data.report?.output?.productName || '')
        setGroupStatuses(brief.audienceGroups.map(() => 'pending' as GroupStatus))
        setGroupResults(brief.audienceGroups.map(() => ({} as GroupResult)))
        setPhase('ready')
      } catch (err) {
        setError((err as Error).message)
        setPhase('error')
      }
    }

    loadBrief()
  }, [productId, reportId])

  // Execute all groups sequentially
  const startExecution = async () => {
    setPhase('executing')

    for (let i = 0; i < groups.length; i++) {
      setCurrentGroupIdx(i)
      const group = groups[i]

      // Phase 1: Model routing animation
      setGroupStatuses(prev => prev.map((s, j) => j === i ? 'routing' : s))
      setCurrentStep(0)
      setCurrentPhase('asset')
      await sleep(2500) // Let ModelRouter animation play

      // Phase 2: Generate actual image
      setGroupStatuses(prev => prev.map((s, j) => j === i ? 'generating_asset' : s))

      const imagePrompt = buildImagePrompt(group, productName)

      // Animate thinking steps
      const stepAnimator = animateSteps(ASSET_STEPS.length, setCurrentStep)

      try {
        const imgRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: imagePrompt, type: 'image' }),
        })
        const imgData = await imgRes.json()
        stepAnimator.stop()

        if (imgData.imageData) {
          setGroupResults(prev => prev.map((r, j) => j === i ? {
            ...r,
            imageData: imgData.imageData,
            imagePrompt,
            creative: {
              headline: group.sellingPoint.split('.')[0] || group.audienceTag,
              bodyCopy: group.sellingPoint,
              ctaText: 'Get Started',
              format: group.creativeDirection.includes('video') ? 'Video' : 'Static Image',
              visualDescription: group.creativeDirection,
            },
          } : r))
        }
      } catch (err) {
        stepAnimator.stop()
        setGroupResults(prev => prev.map((r, j) => j === i ? {
          ...r, error: `Image generation failed: ${(err as Error).message}`,
        } : r))
      }

      // Phase 3: Generate landing page
      setGroupStatuses(prev => prev.map((s, j) => j === i ? 'generating_landing' : s))
      setCurrentStep(0)
      setCurrentPhase('landing')

      const landingAnimator = animateSteps(LANDING_STEPS.length, setCurrentStep)

      try {
        const lpRes = await fetch('/api/brief/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId,
            productId,
            audienceGroups: [group], // Just this one group
          }),
        })
        const lpData = await lpRes.json()
        landingAnimator.stop()

        if (lpData.results?.[0]) {
          setGroupResults(prev => prev.map((r, j) => j === i ? {
            ...r,
            landingPageHtml: lpData.results[0].landingPageHtml,
            creative: lpData.results[0].creative || r.creative,
          } : r))
        }
      } catch (err) {
        landingAnimator.stop()
        setGroupResults(prev => prev.map((r, j) => j === i ? {
          ...r, error: (r.error || '') + ` Landing page failed: ${(err as Error).message}`,
        } : r))
      }

      // Done with this group
      setGroupStatuses(prev => prev.map((s, j) => j === i ? 'done' : s))
    }

    setPhase('done')
    setCurrentGroupIdx(-1)
  }

  // ── Error State ──
  if (phase === 'error') {
    return (
      <div style={{
        minHeight: '100vh', background: C.lightGray,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, "SF Pro Display", Arial, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: C.nearBlack, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ fontSize: 17, color: C.text48, marginBottom: 24 }}>{error}</p>
          <a href="/" style={{ color: C.blue, fontSize: 17, textDecoration: 'none' }}>Back to Dashboard</a>
        </div>
      </div>
    )
  }

  // ── Loading State ──
  if (phase === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', background: C.black, color: C.white,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, "SF Pro Display", Arial, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={32} color={C.brightBlue} style={{ animation: 'spin 1s linear infinite', marginBottom: 16 }} />
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.48)' }}>Loading campaign brief...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  // ── Ready State — Show brief overview + Start button ──
  if (phase === 'ready') {
    return (
      <div style={{ fontFamily: '-apple-system, "SF Pro Display", Arial, sans-serif' }}>
        <section style={{ background: C.black, color: C.white, padding: '80px 0', textAlign: 'center' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.brightBlue, marginBottom: 16 }}>
              Campaign Execution
            </div>
            <h1 style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.07, letterSpacing: -0.28, marginBottom: 16 }}>
              {productName}
            </h1>
            <p style={{ fontSize: 21, fontWeight: 400, lineHeight: 1.19, color: 'rgba(255,255,255,0.48)', maxWidth: 600, margin: '0 auto 40px' }}>
              Ready to generate {groups.length} sets of creatives + landing pages.
              Each tailored to a unique audience.
            </p>

            {/* Group Preview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${groups.length}, 1fr)`, gap: 16, marginBottom: 40 }}>
              {groups.map((g, i) => (
                <div key={g.id} style={{
                  background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px 16px',
                  textAlign: 'left',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: ['#ff453a', '#ffd60a', '#30d158'][i] }} />
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                      Group {i + 1} - {g.region}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.29, marginBottom: 4 }}>{g.audienceTag}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', lineHeight: 1.43 }}>
                    {g.creativeDirection.slice(0, 80)}...
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={startExecution}
              style={{
                background: C.blue, color: C.white, border: 'none', borderRadius: 8,
                padding: '14px 36px', fontSize: 17, fontWeight: 400, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}
            >
              <Play size={18} /> Start Generation
            </button>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', marginTop: 16 }}>
              Estimated time: ~{groups.length * 30}s
            </p>
          </div>
        </section>
      </div>
    )
  }

  // ── Executing / Done State ──
  return (
    <div style={{ fontFamily: '-apple-system, "SF Pro Display", Arial, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      {/* Status Header */}
      <section style={{ background: C.black, color: C.white, padding: '40px 0', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            {groups.map((g, i) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
                  background: groupStatuses[i] === 'done' ? '#30d158' :
                              currentGroupIdx === i ? C.blue : 'rgba(255,255,255,0.1)',
                  color: C.white,
                  transition: 'all 0.3s',
                }}>
                  {groupStatuses[i] === 'done' ? <Check size={14} /> : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: currentGroupIdx === i ? C.white : 'rgba(255,255,255,0.48)' }}>
                  {g.region}
                </span>
                {i < groups.length - 1 && <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.1)' }} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Generation Cards for each group */}
      {groups.map((group, i) => {
        const status = groupStatuses[i]
        const result = groupResults[i]
        const isActive = currentGroupIdx === i
        const accent = ['#ff453a', '#ffd60a', '#30d158'][i]

        return (
          <section key={group.id} style={{
            background: i % 2 === 0 ? C.lightGray : C.white,
            padding: '48px 0',
            opacity: status === 'pending' ? 0.4 : 1,
            transition: 'opacity 0.5s',
          }}>
            <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>

              {/* Group Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.white, fontSize: 14, fontWeight: 600,
                }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.text48 }}>
                    <MapPin size={10} style={{ display: 'inline', marginRight: 4 }} /> {group.region}
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.19, color: C.nearBlack }}>
                    {group.audienceTag}
                  </div>
                </div>
              </div>

              {/* Two columns: Asset generation + Landing page generation */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* ── LEFT: Asset Card ── */}
                <div style={{
                  background: C.white, borderRadius: 12, overflow: 'hidden',
                  boxShadow: isActive ? 'rgba(0,0,0,0.12) 0 4px 24px' : 'rgba(0,0,0,0.06) 0 2px 12px',
                  transition: 'box-shadow 0.3s',
                }}>
                  <div style={{ background: C.black, color: C.white, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Film size={14} color={C.brightBlue} />
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.brightBlue }}>
                      Creative Asset
                    </span>
                    {status === 'done' && result.imageData && (
                      <CheckCircle2 size={14} color="#30d158" style={{ marginLeft: 'auto' }} />
                    )}
                  </div>

                  <div style={{ padding: 16 }}>
                    {/* Pending */}
                    {status === 'pending' && (
                      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text48, fontSize: 14 }}>
                        Waiting...
                      </div>
                    )}

                    {/* Model Routing Animation */}
                    {status === 'routing' && isActive && (
                      <MiniModelRouter />
                    )}

                    {/* Generating — show thinking steps + mini preview */}
                    {(status === 'generating_asset') && isActive && currentPhase === 'asset' && (
                      <div>
                        <MiniThinkingSteps steps={ASSET_STEPS} currentStep={currentStep} />
                        <div style={{
                          marginTop: 12, height: 120, background: C.lightGray, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <div style={{ textAlign: 'center' }}>
                            <Loader2 size={20} color={C.blue} style={{ animation: 'spin 1s linear infinite', marginBottom: 4 }} />
                            <div style={{ fontSize: 11, color: C.text48 }}>Rendering image...</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Generating landing but asset done — show asset result */}
                    {(status === 'generating_landing' || status === 'done') && result.imageData && (
                      <div>
                        <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                          <img
                            src={result.imageData}
                            alt={group.audienceTag}
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                          />
                        </div>
                        {result.creative && (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.text48, marginBottom: 4 }}>
                              {result.creative.format}
                            </div>
                            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.24, color: C.nearBlack, marginBottom: 4 }}>
                              {result.creative.headline}
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.43, color: C.text80 }}>
                              {result.creative.bodyCopy}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {status === 'done' && !result.imageData && (
                      <div style={{ padding: 20, textAlign: 'center', color: '#ff453a', fontSize: 14 }}>
                        {result.error || 'Asset generation failed'}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── RIGHT: Landing Page Card ── */}
                <div style={{
                  background: C.white, borderRadius: 12, overflow: 'hidden',
                  boxShadow: isActive ? 'rgba(0,0,0,0.12) 0 4px 24px' : 'rgba(0,0,0,0.06) 0 2px 12px',
                  transition: 'box-shadow 0.3s',
                }}>
                  <div style={{
                    background: C.black, color: C.white, padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={14} color={C.brightBlue} />
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.brightBlue }}>
                        Landing Page
                      </span>
                    </div>
                    {status === 'done' && result.landingPageHtml && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => navigator.clipboard.writeText(result.landingPageHtml || '')} style={miniBtn}>
                          <Copy size={10} /> Copy
                        </button>
                        <button onClick={() => setPreviewIdx(previewIdx === i ? null : i)} style={miniBtn}>
                          <Eye size={10} /> {previewIdx === i ? 'Mini' : 'Full'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 16 }}>
                    {/* Pending */}
                    {(status === 'pending' || status === 'routing') && (
                      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text48, fontSize: 14 }}>
                        Waiting...
                      </div>
                    )}

                    {/* Generating asset — landing waiting */}
                    {status === 'generating_asset' && (
                      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text48 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 12 }}>Waiting for creative asset...</div>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', marginTop: 4 }}>Landing page will match creative style</div>
                        </div>
                      </div>
                    )}

                    {/* Generating landing — show thinking steps */}
                    {status === 'generating_landing' && isActive && currentPhase === 'landing' && (
                      <div>
                        <MiniThinkingSteps steps={LANDING_STEPS} currentStep={currentStep} />
                        <div style={{
                          marginTop: 12, height: 80, background: C.lightGray, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <div style={{ textAlign: 'center' }}>
                            <Loader2 size={16} color={C.blue} style={{ animation: 'spin 1s linear infinite', marginBottom: 2 }} />
                            <div style={{ fontSize: 11, color: C.text48 }}>Building page...</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Done — show iframe preview */}
                    {status === 'done' && result.landingPageHtml && (
                      <div style={{
                        height: previewIdx === i ? 500 : 240,
                        borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)',
                        transition: 'height 0.3s',
                      }}>
                        <iframe
                          srcDoc={result.landingPageHtml}
                          style={{
                            border: 'none',
                            width: previewIdx === i ? '100%' : '200%',
                            height: previewIdx === i ? '100%' : '200%',
                            transform: previewIdx === i ? 'none' : 'scale(0.5)',
                            transformOrigin: 'top left',
                          }}
                          sandbox="allow-scripts"
                        />
                      </div>
                    )}

                    {/* Error or no landing page */}
                    {status === 'done' && !result.landingPageHtml && (
                      <div style={{ padding: 20, textAlign: 'center', color: '#ff453a', fontSize: 14 }}>
                        Landing page generation failed
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )
      })}

      {/* Footer */}
      {phase === 'done' && (
        <section style={{ background: C.black, color: C.white, padding: '60px 0', textAlign: 'center' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
            <CheckCircle2 size={40} color="#30d158" style={{ marginBottom: 16 }} />
            <h2 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.10, marginBottom: 12 }}>
              Campaign Ready
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.48)', marginBottom: 32 }}>
              {groups.length} sets of creatives + landing pages generated successfully.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              <a
                href={`/report/${reportId}`}
                style={{
                  color: C.brightBlue, border: `1px solid ${C.brightBlue}`, borderRadius: 980,
                  padding: '12px 28px', fontSize: 17, textDecoration: 'none',
                }}
              >
                Back to Report
              </a>
              <a
                href="/"
                style={{
                  background: C.blue, color: C.white, borderRadius: 8,
                  padding: '12px 28px', fontSize: 17, textDecoration: 'none',
                }}
              >
                Dashboard
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   Mini Components
   ═══════════════════════════════════════════ */

const miniBtn: React.CSSProperties = {
  background: 'none', border: '1px solid rgba(255,255,255,0.2)',
  color: 'rgba(255,255,255,0.6)', borderRadius: 6,
  padding: '3px 8px', cursor: 'pointer', display: 'flex',
  alignItems: 'center', gap: 4, fontSize: 10,
}

/** Mini ModelRouter — compact version showing model selection */
function MiniModelRouter() {
  const [phase, setPhase] = useState<'analyzing' | 'scoring' | 'selected'>('analyzing')
  const [visible, setVisible] = useState(0)
  const [selected, setSelected] = useState(-1)

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase('scoring')
      IMAGE_MODELS.forEach((_, i) => setTimeout(() => setVisible(i + 1), i * 300))
    }, 800)
    const t2 = setTimeout(() => {
      setSelected(0)
      setPhase('selected')
    }, 800 + IMAGE_MODELS.length * 300 + 400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div style={{ padding: 12, background: C.lightGray, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Cpu size={12} color="#30d158" />
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: '#30d158' }}>
          Model Router
        </span>
        {phase === 'selected' && <CheckCircle2 size={10} color="#30d158" style={{ marginLeft: 'auto' }} />}
      </div>
      {IMAGE_MODELS.map((m, i) => (
        <div key={m.name} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6,
          marginBottom: 2, fontSize: 11,
          opacity: i < visible ? 1 : 0.2,
          background: selected === i ? 'rgba(48,209,88,0.1)' : 'transparent',
          transition: 'all 0.3s',
        }}>
          <span style={{ flex: 1, fontWeight: selected === i ? 600 : 400, color: C.nearBlack }}>{m.name}</span>
          <span style={{ color: C.text48, fontSize: 10 }}>{m.speed}</span>
          <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{
              width: i < visible ? `${m.score}%` : '0%',
              height: '100%', borderRadius: 2,
              background: m.score >= 90 ? '#30d158' : m.score >= 80 ? '#ffd60a' : '#d1d5db',
              transition: 'width 0.5s',
            }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: selected === i ? '#30d158' : C.text48, minWidth: 24, textAlign: 'right' }}>
            {m.score}%
          </span>
          {selected === i && <Sparkles size={10} color="#30d158" />}
        </div>
      ))}
    </div>
  )
}

/** Mini ThinkingSteps — compact version showing step-by-step progress */
function MiniThinkingSteps({ steps, currentStep }: { steps: typeof ASSET_STEPS; currentStep: number }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Brain size={12} color={C.blue} />
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.blue }}>
          Processing
        </span>
      </div>
      {steps.map((step, i) => (
        <div key={step.id} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
          opacity: i <= currentStep ? 1 : 0.25,
          transition: 'opacity 0.3s',
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i < currentStep ? 'rgba(48,209,88,0.1)' : i === currentStep ? 'rgba(0,113,227,0.1)' : C.lightGray,
          }}>
            {i < currentStep ? <Check size={8} color="#30d158" /> :
             i === currentStep ? <Loader2 size={8} color={C.blue} style={{ animation: 'spin 1s linear infinite' }} /> :
             <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#d1d5db' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: i === currentStep ? 600 : 400, color: C.nearBlack }}>{step.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════ */

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function animateSteps(total: number, setStep: (n: number) => void) {
  let i = 0
  let stopped = false
  const interval = setInterval(() => {
    if (stopped || i >= total) { clearInterval(interval); return }
    setStep(i)
    i++
  }, 2000)
  return { stop: () => { stopped = true; clearInterval(interval); setStep(total) } }
}

function buildImagePrompt(group: AudienceGroup, productName: string): string {
  return `Create a professional iGaming marketing banner for "${productName}".

Target audience: ${group.audienceTag} in ${group.region}.
Selling point: ${group.sellingPoint}
Creative direction: ${group.creativeDirection}

Style: Clean, modern, Apple-inspired aesthetic. High contrast. Bold typography.
The image should feel premium and trustworthy, designed for ${group.region} market.
Include the product name "${productName}" prominently.
Format: 1200x628 banner, suitable for social media advertising.`
}
