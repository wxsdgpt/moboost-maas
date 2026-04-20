'use client'

/**
 * /brief/execute — Execute a campaign brief with REAL asset generation.
 *
 * v2 — Three major improvements:
 *   1. PARALLEL: All 3 groups execute simultaneously (independent state per group)
 *   2. VIDEO:    Detects "video" in creativeDirection → VEO 3.1 async (submit/poll/download)
 *   3. LANDING:  Shows code streaming during generation → Preview button → rendered iframe
 *
 * Apple-inspired design (DESIGN.md).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Loader2, CheckCircle2, ExternalLink, Copy, Download,
  Film, FileText, MapPin, Brain, Check, Cpu, Sparkles,
  ArrowRight, Play, Eye, Image as ImageIcon, Code2,
  RefreshCw, AlertTriangle, Edit3, ChevronDown, ChevronUp,
  Smartphone,
} from 'lucide-react'
import type { AudienceGroup } from '@/lib/reportTypes'
import DevicePreviewModal from '@/components/DevicePreviewModal'

const C = {
  black: 'var(--bg)',
  nearBlack: 'var(--text-1)',
  lightGray: 'var(--surface-1)',
  blue: 'var(--brand)',
  brightBlue: 'var(--brand)',
  white: 'var(--text-1)',
  text80: 'var(--text-2)',
  text48: 'var(--text-3)',
}

/* ── Thinking Steps ── */
const IMAGE_STEPS = [
  { id: '1', label: 'Analyzing audience profile', detail: 'Demographics, interests, behavior' },
  { id: '2', label: 'Matching creative direction', detail: 'Optimal format and visual style' },
  { id: '3', label: 'Selecting best model', detail: 'Routing to NanoBanana Pro' },
  { id: '4', label: 'Generating prompt', detail: 'Building optimized generation prompt' },
  { id: '5', label: 'Calling generation API', detail: 'Sending to NanoBanana Pro' },
  { id: '6', label: 'Rendering image', detail: 'AI model is creating your visual' },
]

const VIDEO_STEPS = [
  { id: '1', label: 'Analyzing audience profile', detail: 'Demographics, interests, behavior' },
  { id: '2', label: 'Matching creative direction', detail: 'Optimal video format and style' },
  { id: '3', label: 'Selecting best model', detail: 'Routing to VEO 3.1' },
  { id: '4', label: 'Submitting video job', detail: 'Initializing async video generation' },
  { id: '5', label: 'Rendering video', detail: 'VEO 3.1 is creating your video (~45s)' },
  { id: '6', label: 'Downloading result', detail: 'Fetching completed video' },
]

const LANDING_STEPS = [
  { id: '1', label: 'Analyzing selling point', detail: 'Extracting key messages' },
  { id: '2', label: 'Matching creative style', detail: 'Ensuring page matches asset visual' },
  { id: '3', label: 'Building page structure', detail: 'Hero, features, social proof, CTA' },
  { id: '4', label: 'Generating HTML', detail: 'Creating responsive, self-contained page' },
]

/* ── Model candidates ── */
const IMAGE_MODELS = [
  { name: 'NanoBanana Pro', score: 96, speed: '~8s' },
  { name: 'Midjourney V6', score: 88, speed: '~15s' },
  { name: 'SDXL Turbo', score: 72, speed: '~3s' },
]

const VIDEO_MODELS = [
  { name: 'VEO 3.1', score: 94, speed: '~45s' },
  { name: 'Sora', score: 89, speed: '~60s' },
  { name: 'Runway Gen-3', score: 74, speed: '~30s' },
]

/* ── Per-group state ── */
type AssetPhase = 'pending' | 'routing' | 'generating' | 'polling' | 'done' | 'error'
type LandingPhase = 'pending' | 'generating' | 'done' | 'error'

type GroupState = {
  assetPhase: AssetPhase
  landingPhase: LandingPhase
  assetStep: number
  landingStep: number
  // Asset result
  imageData?: string
  videoData?: string
  videoUrl?: string
  assetType: 'image' | 'video'
  assetPrompt?: string
  creative?: {
    headline: string
    bodyCopy: string
    ctaText: string
    format: string
    visualDescription: string
  }
  // Landing page result
  landingPageHtml?: string
  landingCodeLines: string[] // for streaming effect
  landingCodeVisible: number // how many lines revealed
  showPreview: boolean // toggle between code view and iframe
  // Errors & Retry
  assetError?: string
  landingError?: string
  assetRetryCount: number
  landingRetryCount: number
  showAssetPromptEditor: boolean
  showLandingPromptEditor: boolean
  editedAssetPrompt?: string
  editedLandingPrompt?: string
}

function initGroupState(group: AudienceGroup): GroupState {
  const isVideo = /video|动态|短视频|15s|30s|motion/i.test(group.creativeDirection)
  return {
    assetPhase: 'pending',
    landingPhase: 'pending',
    assetStep: 0,
    landingStep: 0,
    assetType: isVideo ? 'video' : 'image',
    landingCodeLines: [],
    landingCodeVisible: 0,
    showPreview: false,
    assetRetryCount: 0,
    landingRetryCount: 0,
    showAssetPromptEditor: false,
    showLandingPromptEditor: false,
  }
}

export default function BriefExecutePage() {
  const params = useSearchParams()
  const productId = params.get('productId')
  const reportId = params.get('reportId')

  const [phase, setPhase] = useState<'loading' | 'ready' | 'executing' | 'done' | 'error'>('loading')
  const [groups, setGroups] = useState<AudienceGroup[]>([])
  const [groupStates, setGroupStates] = useState<GroupState[]>([])
  const [productName, setProductName] = useState('')
  const [error, setError] = useState('')
  const [brandStyle, setBrandStyle] = useState<BrandStyle | null>(null)
  // Landing page preview modal state
  const [previewModal, setPreviewModal] = useState<{ open: boolean; html: string; title: string }>({ open: false, html: '', title: '' })

  // Helper to update a single group's state
  const updateGroup = useCallback((idx: number, patch: Partial<GroupState>) => {
    setGroupStates(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }, [])

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

        const grps = brief.audienceGroups as AudienceGroup[]
        setGroups(grps)
        const pName = brief.productName || data.report?.output?.productName || ''
        setProductName(pName)
        setGroupStates(grps.map(g => initGroupState(g)))
        setPhase('ready')

        // Async: try to load brand style from knowledge DB
        if (pName) {
          fetchBrandStyle(pName).then(style => {
            if (style) {
              setBrandStyle(style)
            }
          })
        }
      } catch (err) {
        setError((err as Error).message)
        setPhase('error')
      }
    }

    loadBrief()
  }, [productId, reportId])

  const MAX_IMAGE_AUTO_RETRIES = 2
  // Video: NO auto-retry — expensive & slow; show error + manual retry immediately
  const MAX_VIDEO_AUTO_RETRIES = 0

  /* ─────────────────────────────────────────────
     Core asset generation (supports retry with custom prompt)
     ───────────────────────────────────────────── */
  const runAssetGeneration = useCallback(async (idx: number, group: AudienceGroup, customPrompt?: string) => {
    const isVideo = /video|动态|短视频|15s|30s|motion/i.test(group.creativeDirection)
    const maxRetries = isVideo ? MAX_VIDEO_AUTO_RETRIES : MAX_IMAGE_AUTO_RETRIES

    // Phase 1: Routing animation (skip on retry)
    const currentState = groupStates[idx]
    if (!currentState || currentState.assetRetryCount === 0) {
      updateGroup(idx, { assetPhase: 'routing', assetError: undefined })
      await sleep(2200)
    } else {
      updateGroup(idx, { assetPhase: 'generating', assetError: undefined, showAssetPromptEditor: false })
    }

    // Phase 2: Generate
    updateGroup(idx, { assetPhase: 'generating', assetStep: 0 })
    const steps = isVideo ? VIDEO_STEPS : IMAGE_STEPS
    const stepAnim = animateSteps(steps.length, (n) => updateGroup(idx, { assetStep: n }))

    try {
      if (isVideo) {
        const prompt = customPrompt || buildVideoPrompt(group, productName, brandStyle)
        updateGroup(idx, { assetPrompt: prompt })

        const submitRes = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, action: 'submit' }),
        })
        const submitData = await safeJson(submitRes, 'Video submit')
        if (!submitData.jobId) throw new Error(submitData.error || 'Video submit failed')

        updateGroup(idx, { assetPhase: 'polling' })

        const jobId = submitData.jobId
        let pollAttempts = 0
        const maxPoll = 60

        while (pollAttempts < maxPoll) {
          await sleep(3000)
          pollAttempts++

          const pollRes = await fetch('/api/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'poll', jobId }),
          })
          const pollData = await safeJson(pollRes, 'Video poll')

          if (pollData.status === 'completed') {
            const dlRes = await fetch('/api/generate-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'download', jobId }),
            })
            const dlData = await safeJson(dlRes, 'Video download')

            stepAnim.stop()
            updateGroup(idx, {
              assetPhase: 'done',
              videoData: dlData.videoData || undefined,
              videoUrl: dlData.videoUrl || undefined,
              assetPrompt: prompt,
              creative: {
                headline: group.sellingPoint.split('.')[0] || group.audienceTag,
                bodyCopy: group.sellingPoint,
                ctaText: 'Watch Now',
                format: '15s Video',
                visualDescription: group.creativeDirection,
              },
            })
            // Persist video creative to project_assets so the report-detail
            // view can list it later. Fire-and-forget — UI doesn't depend
            // on this and a save failure shouldn't block the user.
            if (reportId) {
              const videoUrl = dlData.videoUrl || dlData.videoData
              if (videoUrl) {
                fetch('/api/brief/save-creative', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    reportId,
                    type: 'video',
                    url: videoUrl,
                    prompt,
                    audienceTag: group.audienceTag,
                    region: group.region,
                  }),
                }).catch((err) => console.warn('[save-creative] video persist failed:', err))
              }
            }
            return
          }

          if (pollData.status === 'failed') {
            throw new Error('Video generation failed on server')
          }
        }

        throw new Error('Video generation timed out (~3min). The VEO 3.1 API may be overloaded.')

      } else {
        const prompt = customPrompt || buildImagePrompt(group, productName, brandStyle)
        updateGroup(idx, { assetPrompt: prompt })

        const imgRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, type: 'image' }),
        })
        const imgData = await safeJson(imgRes, 'Image generation')
        stepAnim.stop()

        if (imgData.imageData) {
          updateGroup(idx, {
            assetPhase: 'done',
            imageData: imgData.imageData,
            assetPrompt: prompt,
            creative: {
              headline: group.sellingPoint.split('.')[0] || group.audienceTag,
              bodyCopy: group.sellingPoint,
              ctaText: 'Get Started',
              format: 'Static Banner',
              visualDescription: group.creativeDirection,
            },
          })
          // Persist image creative — see video branch above for rationale.
          if (reportId) {
            fetch('/api/brief/save-creative', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reportId,
                type: 'image',
                url: imgData.imageData,
                prompt,
                audienceTag: group.audienceTag,
                region: group.region,
              }),
            }).catch((err) => console.warn('[save-creative] image persist failed:', err))
          }
        } else {
          throw new Error(imgData.error || 'Image generation returned no data')
        }
      }
    } catch (err) {
      stepAnim.stop()
      const errMsg = (err as Error).message
      const retryCount = groupStates[idx]?.assetRetryCount ?? 0

      if (retryCount < maxRetries) {
        // Auto-retry (image only — video never auto-retries)
        updateGroup(idx, {
          assetRetryCount: retryCount + 1,
          assetError: `Attempt ${retryCount + 1} failed: ${errMsg}. Auto-retrying...`,
          assetPhase: 'generating',
        })
        await sleep(1500)
        return runAssetGeneration(idx, group, customPrompt)
      }

      // Show error UI with retry button and reason
      updateGroup(idx, {
        assetPhase: 'error',
        assetError: errMsg,
        assetRetryCount: retryCount,
        assetPrompt: customPrompt || (isVideo ? buildVideoPrompt(group, productName, brandStyle) : buildImagePrompt(group, productName, brandStyle)),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, updateGroup, groupStates, brandStyle])

  /* ─────────────────────────────────────────────
     Core landing page generation (supports retry)
     ───────────────────────────────────────────── */
  const runLandingGeneration = useCallback(async (idx: number, group: AudienceGroup) => {
    // While the API is in flight: thinking-only — no fake/placeholder code.
    // landingCodeLines stays empty so the code panel doesn't render. Once
    // real HTML returns we populate it and the UI swaps to the code stream
    // (and the thinking strip hides itself, see render block below).
    updateGroup(idx, {
      landingPhase: 'generating',
      landingStep: 0,
      landingError: undefined,
      showLandingPromptEditor: false,
      landingCodeLines: [],
      landingCodeVisible: 0,
    })
    const stepAnim = animateSteps(LANDING_STEPS.length, (n) => updateGroup(idx, { landingStep: n }))

    try {
      const lpRes = await fetch('/api/brief/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          productId,
          audienceGroups: [group],
        }),
      })
      const lpData = await safeJson(lpRes, 'Landing page')
      stepAnim.stop()

      if (lpData.results?.[0]?.landingPageHtml) {
        const html = lpData.results[0].landingPageHtml
        const lines = html.split('\n')

        // Real code arrived — seed lines (thinking strip auto-hides because
        // landingCodeLines is now non-empty) and reveal in chunks.
        updateGroup(idx, {
          landingPageHtml: html,
          landingCodeLines: lines,
          landingCodeVisible: 0,
          showPreview: false,
          creative: lpData.results[0].creative || undefined,
        })

        const batchSize = Math.max(1, Math.ceil(lines.length / 40))
        for (let l = 0; l < lines.length; l += batchSize) {
          await sleep(75)
          updateGroup(idx, { landingCodeVisible: Math.min(l + batchSize, lines.length) })
        }

        updateGroup(idx, { landingPhase: 'done', landingCodeVisible: lines.length })
      } else {
        throw new Error(lpData.error || 'Landing page returned no HTML')
      }
    } catch (err) {
      stepAnim.stop()
      const errMsg = (err as Error).message
      const retryCount = groupStates[idx]?.landingRetryCount ?? 0

      if (retryCount < MAX_IMAGE_AUTO_RETRIES) {
        updateGroup(idx, {
          landingRetryCount: retryCount + 1,
          landingError: `Attempt ${retryCount + 1} failed: ${errMsg}. Auto-retrying...`,
          landingPhase: 'generating',
        })
        await sleep(1500)
        return runLandingGeneration(idx, group)
      }

      updateGroup(idx, { landingPhase: 'error', landingError: errMsg })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, reportId, updateGroup, groupStates])

  /* ─────────────────────────────────────────────
     Manual retry handlers (called from error UI)
     ───────────────────────────────────────────── */
  const retryAsset = useCallback((idx: number, group: AudienceGroup, customPrompt?: string) => {
    updateGroup(idx, { assetRetryCount: 0, assetError: undefined, showAssetPromptEditor: false })
    runAssetGeneration(idx, group, customPrompt)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAssetGeneration, updateGroup])

  const retryLanding = useCallback((idx: number, group: AudienceGroup) => {
    updateGroup(idx, { landingRetryCount: 0, landingError: undefined, showLandingPromptEditor: false })
    runLandingGeneration(idx, group)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runLandingGeneration, updateGroup])

  /* ─────────────────────────────────────────────
     Fallback: generate a simple static placeholder
     ───────────────────────────────────────────── */
  const useFallbackAsset = useCallback((idx: number, group: AudienceGroup) => {
    const isVideo = /video|动态|短视频|15s|30s|motion/i.test(group.creativeDirection)
    updateGroup(idx, {
      assetPhase: 'done',
      assetError: undefined,
      showAssetPromptEditor: false,
      // Use a placeholder SVG as fallback image
      imageData: buildFallbackSvg(productName, group),
      creative: {
        headline: `${productName} - ${group.region}`,
        bodyCopy: group.sellingPoint,
        ctaText: isVideo ? 'Watch Now' : 'Get Started',
        format: isVideo ? 'Fallback Static' : 'Static Banner (Fallback)',
        visualDescription: `Fallback placeholder for ${group.audienceTag}`,
      },
    })
  }, [productName, updateGroup])

  /* ─────────────────────────────────────────────
     Execute one group (asset + landing in parallel)
     ───────────────────────────────────────────── */
  const executeGroup = useCallback(async (idx: number, group: AudienceGroup) => {
    await Promise.all([runAssetGeneration(idx, group), runLandingGeneration(idx, group)])
  }, [runAssetGeneration, runLandingGeneration])

  /* ─────────────────────────────────────────────
     Start all groups in parallel
     ───────────────────────────────────────────── */
  const startExecution = useCallback(async () => {
    setPhase('executing')

    // Launch all groups simultaneously
    await Promise.all(groups.map((group, idx) => executeGroup(idx, group)))

    setPhase('done')
  }, [groups, executeGroup])

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
          <p style={{ fontSize: 17, color: 'var(--text-3)' }}>Loading campaign brief...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  // ── Ready State ──
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
            <p style={{ fontSize: 21, fontWeight: 400, lineHeight: 1.19, color: 'var(--text-3)', maxWidth: 600, margin: '0 auto 40px' }}>
              Ready to generate {groups.length} sets of creatives + landing pages in parallel.
              Each tailored to a unique audience.
            </p>

            {/* Group Preview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${groups.length}, 1fr)`, gap: 16, marginBottom: 40 }}>
              {groups.map((g, i) => {
                const isVideo = /video|动态|短视频|15s|30s|motion/i.test(g.creativeDirection)
                return (
                  <div key={g.id} style={{
                    background: 'var(--border)', borderRadius: 12, padding: '20px 16px',
                    textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: ['#ff453a', '#ffd60a', '#30d158'][i] }} />
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                        Group {i + 1} - {g.region}
                      </span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 10, fontWeight: 600,
                        padding: '2px 6px', borderRadius: 4,
                        background: isVideo ? 'rgba(41,151,255,0.2)' : 'rgba(48,209,88,0.2)',
                        color: isVideo ? C.brightBlue : '#30d158',
                      }}>
                        {isVideo ? 'VIDEO' : 'IMAGE'}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.29, marginBottom: 4 }}>{g.audienceTag}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.43 }}>
                      {g.creativeDirection.slice(0, 80)}...
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={startExecution}
              style={{
                background: C.blue, color: 'var(--brand-text)', border: 'none', borderRadius: 8,
                padding: '14px 36px', fontSize: 17, fontWeight: 400, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}
            >
              <Play size={18} /> Start Parallel Generation
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 16 }}>
              All {groups.length} groups generate simultaneously • Estimated: ~45s
            </p>
          </div>
        </section>
      </div>
    )
  }

  // ── Executing / Done State ──
  return (
    <div style={{ fontFamily: '-apple-system, "SF Pro Display", Arial, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
        .code-stream::-webkit-scrollbar { width: 4px; }
        .code-stream::-webkit-scrollbar-thumb { background: var(--text-3); border-radius: 2px; }
      `}</style>

      {/* Status Header */}
      <section style={{ background: C.black, color: C.white, padding: '40px 0', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            {groups.map((g, i) => {
              const gs = groupStates[i]
              const isDone = gs?.assetPhase === 'done' && gs?.landingPhase === 'done'
              const isActive = gs?.assetPhase !== 'pending' && !isDone
              return (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
                    background: isDone ? '#30d158' : isActive ? C.blue : 'var(--surface-1)',
                    color: 'var(--text-1)', transition: 'all 0.3s',
                  }}>
                    {isDone ? <Check size={14} /> : i + 1}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive || isDone ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {g.region}
                  </span>
                  {gs && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {isDone ? '✓' : isActive ? (gs.assetPhase === 'polling' ? 'rendering video...' : gs.landingPhase === 'generating' ? 'landing page...' : 'generating...') : ''}
                    </span>
                  )}
                  {i < groups.length - 1 && <div style={{ width: 40, height: 1, background: 'var(--surface-1)' }} />}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Generation Cards for each group */}
      {groups.map((group, i) => {
        const gs = groupStates[i]
        if (!gs) return null
        const isDone = gs.assetPhase === 'done' && gs.landingPhase === 'done'
        const isActive = gs.assetPhase !== 'pending'
        const accent = ['#ff453a', '#ffd60a', '#30d158'][i]

        return (
          <section key={group.id} style={{
            background: 'var(--bg)',
            padding: '48px 0',
            opacity: !isActive ? 0.4 : 1,
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
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.text48 }}>
                    <MapPin size={10} style={{ display: 'inline', marginRight: 4 }} /> {group.region}
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.19, color: C.nearBlack }}>
                    {group.audienceTag}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                  background: gs.assetType === 'video' ? 'rgba(41,151,255,0.1)' : 'rgba(48,209,88,0.1)',
                  color: gs.assetType === 'video' ? C.brightBlue : '#30d158',
                }}>
                  {gs.assetType === 'video' ? 'VIDEO + LANDING' : 'IMAGE + LANDING'}
                </span>
              </div>

              {/* Two columns: Asset + Landing Page */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* ── LEFT: Asset Card ── */}
                <div style={{
                  background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
                  boxShadow: isActive && !isDone ? 'rgba(0,0,0,0.12) 0 4px 24px' : 'rgba(0,0,0,0.06) 0 2px 12px',
                  transition: 'box-shadow 0.3s',
                }}>
                  <div style={{ background: C.black, color: C.white, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {gs.assetType === 'video' ? <Film size={14} color={C.brightBlue} /> : <ImageIcon size={14} color={C.brightBlue} />}
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.brightBlue }}>
                      {gs.assetType === 'video' ? 'Video Asset' : 'Creative Asset'}
                    </span>
                    {gs.assetPhase === 'done' && (gs.imageData || gs.videoData || gs.videoUrl) && (
                      <CheckCircle2 size={14} color="#30d158" style={{ marginLeft: 'auto' }} />
                    )}
                    {gs.assetPhase === 'polling' && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', animation: 'pulse 2s infinite' }}>
                        Rendering...
                      </span>
                    )}
                  </div>

                  <div style={{ padding: 16 }}>
                    {/* Pending */}
                    {gs.assetPhase === 'pending' && (
                      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text48, fontSize: 14 }}>
                        Waiting...
                      </div>
                    )}

                    {/* Model Routing Animation */}
                    {gs.assetPhase === 'routing' && (
                      <MiniModelRouter models={gs.assetType === 'video' ? VIDEO_MODELS : IMAGE_MODELS} />
                    )}

                    {/* Generating / Polling — show thinking steps */}
                    {(gs.assetPhase === 'generating' || gs.assetPhase === 'polling') && (
                      <div>
                        <MiniThinkingSteps
                          steps={gs.assetType === 'video' ? VIDEO_STEPS : IMAGE_STEPS}
                          currentStep={gs.assetStep}
                        />
                        <div style={{
                          marginTop: 12, height: 120, background: C.lightGray, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <div style={{ textAlign: 'center' }}>
                            <Loader2 size={20} color={C.blue} style={{ animation: 'spin 1s linear infinite', marginBottom: 4 }} />
                            <div style={{ fontSize: 11, color: C.text48 }}>
                              {gs.assetType === 'video'
                                ? gs.assetPhase === 'polling' ? 'VEO 3.1 rendering video...' : 'Submitting video job...'
                                : 'Rendering image...'
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Done — show result */}
                    {gs.assetPhase === 'done' && (gs.imageData || gs.videoData || gs.videoUrl) && (
                      <div>
                        <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                          {gs.assetType === 'video' ? (
                            <video
                              src={gs.videoData || gs.videoUrl}
                              controls
                              loop
                              playsInline
                              preload="metadata"
                              style={{ width: '100%', height: 'auto', display: 'block', background: '#000' }}
                            />
                          ) : (
                            <img
                              src={gs.imageData}
                              alt={group.audienceTag}
                              style={{ width: '100%', height: 'auto', display: 'block' }}
                            />
                          )}
                        </div>
                        {gs.creative && (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: C.text48, marginBottom: 4 }}>
                              {gs.creative.format}
                            </div>
                            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.24, color: C.nearBlack, marginBottom: 4 }}>
                              {gs.creative.headline}
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.43, color: C.text80 }}>
                              {gs.creative.bodyCopy}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error — with retry, prompt editor, fallback */}
                    {gs.assetPhase === 'error' && (
                      <div style={{ padding: 16 }}>
                        {/* Error reason */}
                        <div style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12,
                          background: 'rgba(255,69,58,0.06)', borderRadius: 8, marginBottom: 12,
                        }}>
                          <AlertTriangle size={16} color="#ff453a" style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#ff453a', marginBottom: 2 }}>
                              Generation Failed
                            </div>
                            <div style={{ fontSize: 12, color: C.text80, lineHeight: 1.43 }}>
                              {gs.assetError || 'Unknown error'}
                            </div>
                            {gs.assetRetryCount > 0 && (
                              <div style={{ fontSize: 11, color: C.text48, marginTop: 4 }}>
                                Auto-retried {gs.assetRetryCount} time{gs.assetRetryCount > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                          <button
                            onClick={() => retryAsset(i, group)}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              background: C.blue, color: 'var(--brand-text)', border: 'none', borderRadius: 8,
                              padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            <RefreshCw size={14} /> Retry
                          </button>
                          <button
                            onClick={() => updateGroup(i, { showAssetPromptEditor: !gs.showAssetPromptEditor })}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              background: 'none', color: C.nearBlack, border: '1px solid var(--border)',
                              borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            <Edit3 size={14} /> Edit Prompt
                            {gs.showAssetPromptEditor ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <button
                            onClick={() => useFallbackAsset(i, group)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              background: 'none', color: C.text48, border: '1px solid var(--border)',
                              borderRadius: 8, padding: '10px 12px', fontSize: 12, cursor: 'pointer',
                            }}
                            title="Use a simple placeholder"
                          >
                            Fallback
                          </button>
                        </div>

                        {/* Prompt editor (collapsible) */}
                        {gs.showAssetPromptEditor && (
                          <div>
                            <textarea
                              value={gs.editedAssetPrompt ?? gs.assetPrompt ?? ''}
                              onChange={(e) => updateGroup(i, { editedAssetPrompt: e.target.value })}
                              style={{
                                width: '100%', height: 160, padding: 12, borderRadius: 8,
                                border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.5,
                                fontFamily: '"SF Mono", "Fira Code", monospace', resize: 'vertical',
                                color: C.nearBlack, background: C.lightGray, outline: 'none',
                              }}
                            />
                            <button
                              onClick={() => retryAsset(i, group, gs.editedAssetPrompt || gs.assetPrompt)}
                              style={{
                                marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
                                background: C.blue, color: 'var(--brand-text)', border: 'none', borderRadius: 8,
                                padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              <RefreshCw size={14} /> Retry with Edited Prompt
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── RIGHT: Landing Page Card ── */}
                <div style={{
                  background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
                  boxShadow: isActive && !isDone ? 'rgba(0,0,0,0.12) 0 4px 24px' : 'rgba(0,0,0,0.06) 0 2px 12px',
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
                    {gs.landingPhase === 'done' && gs.landingPageHtml && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => navigator.clipboard.writeText(gs.landingPageHtml || '')} style={miniBtn}>
                          <Copy size={10} /> Copy
                        </button>
                        <button
                          onClick={() => setPreviewModal({ open: true, html: gs.landingPageHtml || '', title: `${group.audienceTag} - ${group.region}` })}
                          style={{
                            ...miniBtn,
                            background: 'rgba(41,151,255,0.15)',
                            borderColor: C.brightBlue,
                            color: C.brightBlue,
                          }}
                        >
                          <Eye size={10} /> Preview
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 0 }}>
                    {/* Pending */}
                    {gs.landingPhase === 'pending' && (
                      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text48, fontSize: 14, padding: 16 }}>
                        Waiting...
                      </div>
                    )}

                    {/* Generating — thinking-only until real code arrives.
                        Once landingCodeLines populates, the thinking strip
                        unmounts and the code stream takes its place at the
                        top of the panel (no fake placeholder code). */}
                    {gs.landingPhase === 'generating' && (
                      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
                        {gs.landingCodeLines.length === 0 ? (
                          <MiniThinkingSteps steps={LANDING_STEPS} currentStep={gs.landingStep} />
                        ) : (
                          <CodeStreamView lines={gs.landingCodeLines} visibleCount={gs.landingCodeVisible} />
                        )}
                      </div>
                    )}

                    {/* Done — Code view with Preview button overlay */}
                    {gs.landingPhase === 'done' && gs.landingPageHtml && (
                      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 420, padding: 16 }}>
                        <CodeStreamView lines={gs.landingCodeLines} visibleCount={gs.landingCodeVisible} />
                        <div style={{
                          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                        }}>
                          <button
                            onClick={() => setPreviewModal({ open: true, html: gs.landingPageHtml || '', title: `${group.audienceTag} - ${group.region}` })}
                            style={{
                              background: C.blue, color: 'var(--brand-text)', border: 'none', borderRadius: 980,
                              padding: '8px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 6,
                              boxShadow: '0 4px 12px rgba(192,228,99,0.4)',
                            }}
                          >
                            <Smartphone size={14} /> Preview on Device
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Error — with retry and details */}
                    {gs.landingPhase === 'error' && (
                      <div style={{ padding: 16 }}>
                        <div style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12,
                          background: 'rgba(255,69,58,0.06)', borderRadius: 8, marginBottom: 12,
                        }}>
                          <AlertTriangle size={16} color="#ff453a" style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#ff453a', marginBottom: 2 }}>
                              Landing Page Failed
                            </div>
                            <div style={{ fontSize: 12, color: C.text80, lineHeight: 1.43 }}>
                              {gs.landingError || 'Unknown error'}
                            </div>
                            {gs.landingRetryCount > 0 && (
                              <div style={{ fontSize: 11, color: C.text48, marginTop: 4 }}>
                                Auto-retried {gs.landingRetryCount} time{gs.landingRetryCount > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => retryLanding(i, group)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            width: '100%', background: C.blue, color: 'var(--brand-text)', border: 'none', borderRadius: 8,
                            padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <RefreshCw size={14} /> Retry Landing Page
                        </button>
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
            <p style={{ fontSize: 17, color: 'var(--text-3)', marginBottom: 32 }}>
              {groups.length} sets of creatives + landing pages generated in parallel.
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
                  background: 'var(--brand)', color: 'var(--brand-text)', borderRadius: 8,
                  padding: '12px 28px', fontSize: 17, textDecoration: 'none',
                }}
              >
                Dashboard
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Device Preview Modal */}
      {previewModal.open && (
        <DevicePreviewModal
          html={previewModal.html}
          title={previewModal.title}
          onClose={() => setPreviewModal({ open: false, html: '', title: '' })}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════ */

const miniBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)',
  color: 'var(--text-2)', borderRadius: 6,
  padding: '3px 8px', cursor: 'pointer', display: 'flex',
  alignItems: 'center', gap: 4, fontSize: 10,
}

/** Code streaming view — dark terminal-style block showing HTML lines appearing */
function CodeStreamView({ lines, visibleCount }: { lines: string[]; visibleCount: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visibleCount])

  return (
    <div
      ref={scrollRef}
      className="code-stream"
      style={{
        background: '#1a1a2e', borderRadius: 8, padding: '12px 16px',
        // Fill the container. Parent controls the total height.
        flex: 1, minHeight: 320, maxHeight: '60vh',
        width: '100%', overflowY: 'auto', marginTop: 12,
        fontFamily: '"SF Mono", "Fira Code", "Menlo", monospace',
        fontSize: 11, lineHeight: 1.6, color: '#a0a0b8',
      }}
    >
      {lines.slice(0, visibleCount).map((line, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 12 }}>
          <span style={{ color: '#4a4a5c', minWidth: 28, textAlign: 'right', userSelect: 'none' }}>
            {idx + 1}
          </span>
          <span style={{
            color: line.includes('<') ? '#7dd3fc'
              : line.includes('{') || line.includes('}') ? '#c084fc'
              : line.includes(':') ? '#86efac'
              : '#a0a0b8',
          }}>
            {line || ' '}
          </span>
        </div>
      ))}
      {visibleCount < lines.length && (
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ color: '#4a4a5c', minWidth: 28, textAlign: 'right' }}>{visibleCount + 1}</span>
          <span style={{ color: C.brightBlue, animation: 'blink 1s infinite' }}>▋</span>
        </div>
      )}
    </div>
  )
}

/** Mini ModelRouter — compact version showing model selection animation */
function MiniModelRouter({ models }: { models: typeof IMAGE_MODELS }) {
  const [phase, setPhase] = useState<'analyzing' | 'scoring' | 'selected'>('analyzing')
  const [visible, setVisible] = useState(0)
  const [selected, setSelected] = useState(-1)

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase('scoring')
      models.forEach((_, i) => setTimeout(() => setVisible(i + 1), i * 300))
    }, 800)
    const t2 = setTimeout(() => {
      setSelected(0)
      setPhase('selected')
    }, 800 + models.length * 300 + 400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [models])

  return (
    <div style={{ padding: 12, background: C.lightGray, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Cpu size={12} color="#30d158" />
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: '#30d158' }}>
          Model Router
        </span>
        {phase === 'selected' && <CheckCircle2 size={10} color="#30d158" style={{ marginLeft: 'auto' }} />}
      </div>
      {models.map((m, i) => (
        <div key={m.name} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6,
          marginBottom: 2, fontSize: 11,
          opacity: i < visible ? 1 : 0.2,
          background: selected === i ? 'rgba(48,209,88,0.1)' : 'transparent',
          transition: 'all 0.3s',
        }}>
          <span style={{ flex: 1, fontWeight: selected === i ? 600 : 400, color: C.nearBlack }}>{m.name}</span>
          <span style={{ color: C.text48, fontSize: 10 }}>{m.speed}</span>
          <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
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
function MiniThinkingSteps({ steps, currentStep }: { steps: { id: string; label: string; detail: string }[]; currentStep: number }) {
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
            background: i < currentStep ? 'rgba(48,209,88,0.1)' : i === currentStep ? 'rgba(192,228,99,0.1)' : C.lightGray,
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

/** Safe JSON parse — throws a readable error if server returns HTML (e.g. auth redirect) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeJson(res: Response, label: string): Promise<any> {
  const ct = res.headers.get('content-type') || ''
  if (!res.ok) {
    if (ct.includes('application/json')) {
      const data = await res.json()
      throw new Error(data.error || data.message || `${label}: HTTP ${res.status}`)
    }
    // Non-JSON error (e.g. HTML error page)
    const text = await res.text()
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(`${label}: Session expired or server error (HTTP ${res.status}). Please reload the page and try again.`)
    }
    throw new Error(`${label}: HTTP ${res.status} — ${text.slice(0, 100)}`)
  }
  if (!ct.includes('application/json')) {
    const text = await res.text()
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(`${label}: Received HTML instead of JSON — your session may have expired. Please reload.`)
    }
    try { return JSON.parse(text) } catch { throw new Error(`${label}: Invalid response format`) }
  }
  return res.json()
}

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

/**
 * Build image prompt — enriched with brand style if available.
 * Brand style comes from industry_knowledge DB (tags: brand_style).
 */
function buildImagePrompt(group: AudienceGroup, productName: string, brandStyle?: BrandStyle | null): string {
  const styleBlock = brandStyle
    ? `\nBrand Visual Style: "${brandStyle.movementName}"
Color palette: Background ${brandStyle.primaryColors.background}, Primary accent ${brandStyle.primaryColors.accentPrimary}, Secondary accent ${brandStyle.primaryColors.accentSecondary}.
Visual direction: ${brandStyle.applicationGuidance.forImages}
Design principles: ${brandStyle.designPrinciples.slice(0, 3).join('. ')}.`
    : `\nStyle: Clean, modern, Apple-inspired aesthetic. High contrast. Bold typography.`

  return `Create a professional iGaming marketing banner for "${productName}".

Target audience: ${group.audienceTag} in ${group.region}.
Selling point: ${group.sellingPoint}
Creative direction: ${group.creativeDirection}
${styleBlock}
The image should feel premium and trustworthy, designed for ${group.region} market.
Include the product name "${productName}" prominently.
Format: 1200x628 banner, suitable for social media advertising.`
}

function buildFallbackSvg(productName: string, group: AudienceGroup): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1d1d1f"/>
        <stop offset="100%" style="stop-color:#c0e463"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="628" fill="url(#bg)" rx="12"/>
    <text x="600" y="260" font-family="-apple-system,SF Pro Display,Helvetica Neue,Arial,sans-serif" font-size="52" font-weight="600" fill="white" text-anchor="middle">${productName}</text>
    <text x="600" y="320" font-family="-apple-system,SF Pro Display,Helvetica Neue,Arial,sans-serif" font-size="24" fill="rgba(255,255,255,0.6)" text-anchor="middle">${group.audienceTag} · ${group.region}</text>
    <text x="600" y="380" font-family="-apple-system,SF Pro Display,Helvetica Neue,Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.4)" text-anchor="middle">${group.sellingPoint.slice(0, 80)}</text>
    <rect x="500" y="420" width="200" height="48" rx="24" fill="#c0e463"/>
    <text x="600" y="450" font-family="-apple-system,SF Pro Display,Helvetica Neue,Arial,sans-serif" font-size="16" font-weight="600" fill="white" text-anchor="middle">Get Started</text>
    <text x="600" y="590" font-family="-apple-system,SF Pro Display,Helvetica Neue,Arial,sans-serif" font-size="11" fill="rgba(255,255,255,0.25)" text-anchor="middle">Fallback placeholder — retry with a different prompt for AI-generated visuals</text>
  </svg>`
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

function buildVideoPrompt(group: AudienceGroup, productName: string, brandStyle?: BrandStyle | null): string {
  const styleBlock = brandStyle
    ? `\nBrand Visual Style: "${brandStyle.movementName}"
Color palette: Background ${brandStyle.primaryColors.background}, Primary accent ${brandStyle.primaryColors.accentPrimary}, Secondary accent ${brandStyle.primaryColors.accentSecondary}.
Visual direction: ${brandStyle.applicationGuidance.forVideo}
Design principles: ${brandStyle.designPrinciples.slice(0, 3).join('. ')}.`
    : `\nStyle: Cinematic, premium feel. Apple-inspired clean aesthetics.`

  return `Create a 15-second promotional video for "${productName}" — an iGaming product.

Target audience: ${group.audienceTag} in ${group.region}.
Selling point: ${group.sellingPoint}
Creative direction: ${group.creativeDirection}
${styleBlock}
Start with a bold product reveal, show key benefits through dynamic motion graphics,
end with a strong call-to-action. The mood should match the ${group.region} market —
vibrant, exciting, and trustworthy. Include the product name "${productName}".
Professional voiceover tone. 16:9 aspect ratio.`
}

/* ═══════════════════════════════════════════
   Brand Style Types & Fetcher
   ═══════════════════════════════════════════ */

interface BrandStyle {
  movementName: string
  primaryColors: {
    background: string
    accentPrimary: string
    accentPrimaryLight: string
    accentSecondary: string
    accentSecondaryDim: string
    [key: string]: string
  }
  typography: Record<string, string>
  designPrinciples: string[]
  applicationGuidance: {
    forImages: string
    forVideo: string
    forLandingPage: string
  }
  brandContext: {
    brand: string
    industry: string
    essence: string
  }
}

/**
 * Fetch brand visual style from industry_knowledge DB.
 * Looks for entries tagged with the product name + 'brand_style'.
 * Returns null if none found (falls back to default prompts).
 */
async function fetchBrandStyle(productName: string): Promise<BrandStyle | null> {
  try {
    const normalizedName = productName.toLowerCase().replace(/[^a-z0-9]/g, '')
    const res = await fetch(
      `/api/knowledge?tags=brand_style&search=${encodeURIComponent(normalizedName)}&limit=1`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.entries?.[0]?.structured) {
      return data.entries[0].structured as BrandStyle
    }
    return null
  } catch {
    return null
  }
}
