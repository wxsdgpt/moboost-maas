'use client'

/**
 * /brief/new — Stage 1 of the brief flow.
 *
 * Two-pane layout:
 *   Left  : Asset Spec picker (search + filter chips + grouped by platform)
 *   Right : Multimodal intake — text description, reference URLs, file uploads
 *
 * Submit calls /api/brief/clarify which returns the Stage 2 ClarifiedBrief
 * including any pendingQuestions. We then render the questions inline so the
 * user can answer them progressively without leaving this page.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  Search,
  Image as ImageIcon,
  Video,
  Link2,
  Upload,
  Wand2,
  X,
  Check,
  ChevronRight,
  Loader2,
  MessageSquare,
  SlidersHorizontal,
  Send,
} from 'lucide-react'
import {
  ASSET_SPECS,
  AssetSpec,
  AssetMediaType,
  Platform,
  CORE_SPECS,
} from '@/lib/assetSpecs'
import type { RawIntake, ClarifiedBrief, UploadedAsset } from '@/lib/briefTypes'
import SpecValidationBadge from '@/components/SpecValidationBadge'

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<Platform, string> = {
  meta: 'Meta (FB / IG)',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  'google-display': 'Google Display',
  programmatic: 'Programmatic',
  ctv: 'CTV / OTT',
  web: 'Web Landing',
  email: 'EDM',
  'app-store-ios': 'App Store (iOS)',
  'app-store-android': 'Play Store',
  universal: 'Universal',
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function ratioBoxStyle(width: number, height: number): React.CSSProperties {
  // Cap height to keep cards compact regardless of orientation
  const maxH = 56
  const maxW = 96
  const wRatio = width / height
  let w = maxW
  let h = maxW / wRatio
  if (h > maxH) {
    h = maxH
    w = maxH * wRatio
  }
  return { width: `${w}px`, height: `${h}px` }
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export default function NewBriefPage() {
  // ── Mode: 'simple' (NL chat) is the default; 'advanced' is the picker ──
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple')

  // ── Simple-mode state ───────────────────────────────────────────────────
  const [simpleInput, setSimpleInput] = useState('')
  const [simpleMeta, setSimpleMeta] = useState<{ engine: string; confidence: number; reasoning: string } | null>(null)

  // ── Spec picker state ───────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [mediaFilter, setMediaFilter] = useState<AssetMediaType | 'all'>('all')
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all')
  const [showAll, setShowAll] = useState(false)
  const [selectedSpecIds, setSelectedSpecIds] = useState<string[]>([])
  const [autoDetect, setAutoDetect] = useState(false)

  // ── Right pane state ────────────────────────────────────────────────────
  const [text, setText] = useState('')
  const [urls, setUrls] = useState<string[]>([])
  const [urlDraft, setUrlDraft] = useState('')
  const [uploadedImages, setUploadedImages] = useState<UploadedAsset[]>([])
  const [uploadedVideos, setUploadedVideos] = useState<UploadedAsset[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)

  // ── Submission / clarification state ────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [clarified, setClarified] = useState<ClarifiedBrief | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // ── Filtered specs ──────────────────────────────────────────────────────
  const visibleSpecs = useMemo(() => {
    const base = showAll ? ASSET_SPECS : CORE_SPECS
    const q = search.trim().toLowerCase()
    return base.filter(s => {
      if (mediaFilter !== 'all' && s.mediaType !== mediaFilter) return false
      if (platformFilter !== 'all' && s.platform !== platformFilter) return false
      if (q) {
        const hay = `${s.id} ${s.name} ${s.nameZh} ${s.aspectRatio}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [search, mediaFilter, platformFilter, showAll])

  // Group visible specs by platform for sectioned rendering
  const grouped = useMemo(() => {
    const map = new Map<Platform, AssetSpec[]>()
    for (const s of visibleSpecs) {
      if (!map.has(s.platform)) map.set(s.platform, [])
      map.get(s.platform)!.push(s)
    }
    return map
  }, [visibleSpecs])

  // Auto-clear selected specs if user toggles autoDetect on
  useEffect(() => {
    if (autoDetect && selectedSpecIds.length > 0) {
      setSelectedSpecIds([])
    }
  }, [autoDetect]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────────────────
  const toggleSpec = (id: string) => {
    setSelectedSpecIds(curr =>
      curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id],
    )
    if (autoDetect) setAutoDetect(false)
  }

  const addUrl = () => {
    const u = urlDraft.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) {
      setError('URL must start with http:// or https://')
      return
    }
    setUrls(curr => [...curr, u])
    setUrlDraft('')
    setError('')
  }

  const removeUrl = (i: number) => {
    setUrls(curr => curr.filter((_, idx) => idx !== i))
  }

  const onFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'video',
  ) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // allow re-selecting same file
    if (!files.length) return

    setUploadingCount(c => c + files.length)
    setError('')

    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        // Pass current spec selection so the upload pipeline runs
        // spec validation inline and we get back UploadedAsset.validations.
        if (selectedSpecIds.length > 0) {
          fd.append('specIds', selectedSpecIds.join(','))
        }
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || `Upload failed (${res.status})`)
        }
        const asset = data.asset as UploadedAsset
        if (kind === 'image') setUploadedImages(curr => [...curr, asset])
        else setUploadedVideos(curr => [...curr, asset])
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`)
      } finally {
        setUploadingCount(c => c - 1)
      }
    }
  }

  const removeFile = (idx: number, kind: 'image' | 'video') => {
    if (kind === 'image') setUploadedImages(curr => curr.filter((_, i) => i !== idx))
    else setUploadedVideos(curr => curr.filter((_, i) => i !== idx))
  }

  const canSubmit =
    !submitting &&
    uploadingCount === 0 &&
    (text.trim().length > 0 ||
      urls.length > 0 ||
      uploadedImages.length > 0 ||
      uploadedVideos.length > 0 ||
      selectedSpecIds.length > 0)

  /**
   * Simple mode: one free-form sentence → /api/brief/parse → /api/brief/clarify
   * This is the default entry point. The user never touches the spec picker
   * unless they opt into Advanced mode.
   */
  const handleSimpleSubmit = async () => {
    const trimmed = simpleInput.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError('')
    setSimpleMeta(null)
    try {
      const parseRes = await fetch('/api/brief/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      const parseData = await parseRes.json()
      if (!parseRes.ok || !parseData.ok) {
        throw new Error(parseData.error || `parse failed (${parseRes.status})`)
      }
      setSimpleMeta(parseData.meta)

      const clarifyRes = await fetch('/api/brief/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseData.intake),
      })
      const clarifyData = await clarifyRes.json()
      if (!clarifyRes.ok || !clarifyData.ok) {
        throw new Error(clarifyData.error || `clarify failed (${clarifyRes.status})`)
      }
      setClarified(clarifyData.brief as ClarifiedBrief)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    // Build a RawIntake from already-uploaded assets and the current form
    // state. Files are uploaded eagerly via /api/upload as the user picks
    // them, so by the time we get here `uploadedImages` / `uploadedVideos`
    // already contain real, server-resolved URLs.
    const intake: RawIntake = {
      id: `brief_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      text: text.trim() || undefined,
      urls: urls.length ? urls : undefined,
      images: uploadedImages.length ? uploadedImages : undefined,
      videos: uploadedVideos.length ? uploadedVideos : undefined,
      targetSpecs: selectedSpecIds,
      specAutoDetect: autoDetect,
      createdAt: Date.now(),
    }

    try {
      const res = await fetch('/api/brief/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intake),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Service error (${res.status})`)
      }
      setClarified(data.brief as ClarifiedBrief)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const setAnswer = (qid: string, value: string) => {
    setAnswers(curr => ({ ...curr, [qid]: value }))
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'var(--nav-bg)', backdropFilter: 'saturate(120%) blur(24px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}>
              <Sparkles className="w-5 h-5" style={{ color: 'var(--brand-contrast)' }} />
            </div>
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Create Brief</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>Stage 1 · Information Collection</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-4)' }}>
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast)' }}>1</span>
              <span className="font-medium" style={{ color: 'var(--text-1)' }}>Collect</span>
            </div>
            <ChevronRight className="w-3 h-3" />
            <span>2 Clarify</span>
            <ChevronRight className="w-3 h-3" />
            <span>3 Merge</span>
            <ChevronRight className="w-3 h-3" />
            <span>4 Generate</span>
          </div>
        </div>
      </header>

      {/* Mode switcher */}
      <div className="max-w-[1400px] mx-auto px-6 pt-6 pb-2">
        <div className="inline-flex items-center border rounded-full p-1 text-xs font-medium" style={{ background: 'var(--surface-1)', borderColor: 'var(--surface-3)' }}>
          <button
            onClick={() => setMode('simple')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full transition"
            style={{
              color: mode === 'simple' ? 'var(--brand-contrast)' : 'var(--text-2)',
              backgroundColor: mode === 'simple' ? 'var(--brand)' : 'transparent',
            }}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Simple Mode
          </button>
          <button
            onClick={() => setMode('advanced')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full transition"
            style={{
              color: mode === 'advanced' ? 'var(--brand-contrast)' : 'var(--text-2)',
              backgroundColor: mode === 'advanced' ? 'var(--brand)' : 'transparent',
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Expert Mode
          </button>
          <span className="text-[11px] pl-3 pr-3" style={{ color: 'var(--text-4)' }}>
            {mode === 'simple'
              ? 'One sentence to create a brief — AI picks specs and references'
              : 'Manual spec selection · File uploads · Full control'}
          </span>
        </div>
      </div>

      {/* Simple mode */}
      {mode === 'simple' && (
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <section className="rounded-lg border p-6" style={{ background: 'var(--surface-1)', borderColor: 'var(--surface-3)', boxShadow: 'var(--shadow-lg)' }}>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
              What do you want to create?
            </label>
            <p className="text-xs mb-4" style={{ color: 'var(--text-4)' }}>
              Example: <span className="italic" style={{ color: 'var(--text-3)' }}>15-second TikTok video for new users with bonus offer, reference https://example.com</span>
            </p>
            <div className="relative">
              <textarea
                value={simpleInput}
                onChange={(e) => setSimpleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSimpleSubmit()
                  }
                }}
                placeholder="Describe what you need in one sentence, optionally with a URL…"
                rows={4}
                className="w-full resize-none rounded-lg border px-4 py-3 text-sm outline-none"
                style={{
                  borderColor: 'var(--surface-3)',
                  backgroundColor: 'var(--surface-1)',
                  color: 'var(--text-1)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--brand)'
                  e.currentTarget.style.backgroundColor = 'var(--surface-2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--surface-3)'
                  e.currentTarget.style.backgroundColor = 'var(--surface-1)'
                }}
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>
                  {simpleInput.length} / 4000 · Cmd+Enter to send
                </span>
                <button
                  onClick={handleSimpleSubmit}
                  disabled={!simpleInput.trim() || submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition"
                  style={{
                    backgroundColor: !simpleInput.trim() || submitting ? 'var(--surface-1)' : 'var(--brand)',
                    color: !simpleInput.trim() || submitting ? 'var(--text-5)' : 'var(--brand-contrast)',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Parsing…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Send
                    </>
                  )}
                </button>
              </div>
            </div>
            {simpleMeta && (
              <div className="mt-4 p-3 rounded-lg border text-xs" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--surface-3)', color: 'var(--text-3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded border text-[10px] font-mono" style={{ background: 'var(--surface-1)', borderColor: 'var(--surface-3)', color: 'var(--text-1)' }}>
                    {simpleMeta.engine}
                  </span>
                  <span>Confidence {(simpleMeta.confidence * 100).toFixed(0)}%</span>
                </div>
                <div style={{ color: 'var(--text-3)' }}>{simpleMeta.reasoning}</div>
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 rounded-lg border text-sm" style={{ color: 'var(--danger)', borderColor: 'rgba(255,82,82,0.2)', backgroundColor: 'var(--danger-bg)' }}>
                {error}
              </div>
            )}
          </section>
        </div>
      )}

      {mode === 'advanced' && (
      <div className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">

        {/* ── LEFT: Spec Picker ──────────────────────────────────────────── */}
        <section className="rounded-lg border p-5" style={{ background: 'var(--surface-1)', borderColor: 'var(--surface-3)', boxShadow: 'var(--shadow-lg)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>What do you want to create?</h2>
            <span className="text-xs" style={{ color: 'var(--text-4)' }}>{selectedSpecIds.length} selected · {visibleSpecs.length} / {ASSET_SPECS.length} shown</span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-4)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search spec name, platform, or aspect ratio (e.g. 9:16)"
              className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border outline-none"
              style={{
                borderColor: 'var(--surface-3)',
                backgroundColor: 'var(--surface-1)',
                color: 'var(--text-1)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--brand)'
                e.currentTarget.style.backgroundColor = 'var(--surface-2)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--surface-3)'
                e.currentTarget.style.backgroundColor = 'var(--surface-1)'
              }}
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <FilterChip active={mediaFilter === 'all'} onClick={() => setMediaFilter('all')}>All</FilterChip>
            <FilterChip active={mediaFilter === 'image'} onClick={() => setMediaFilter('image')} icon={<ImageIcon className="w-3 h-3" />}>Image</FilterChip>
            <FilterChip active={mediaFilter === 'video'} onClick={() => setMediaFilter('video')} icon={<Video className="w-3 h-3" />}>Video</FilterChip>

            <span className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--surface-3)' }} />

            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value as Platform | 'all')}
              className="text-xs px-2.5 py-1.5 rounded-full border outline-none cursor-pointer"
              style={{
                background: 'var(--surface-1)',
                borderColor: 'var(--surface-3)',
                color: 'var(--text-2)',
              }}
            >
              <option value="all">All Platforms</option>
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            <button
              onClick={() => setShowAll(s => !s)}
              className="text-xs px-2.5 py-1.5 rounded-full border outline-none transition"
              style={{
                background: 'var(--surface-1)',
                borderColor: 'var(--surface-3)',
                color: 'var(--text-2)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--brand)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--surface-3)'}
            >
              {showAll ? 'Show Core Only' : `Show All (${ASSET_SPECS.length})`}
            </button>
          </div>

          {/* AI auto-detect option */}
          <button
            onClick={() => setAutoDetect(a => !a)}
            className="w-full mb-4 px-4 py-3 rounded-lg border-2 border-dashed transition-all flex items-center gap-3"
            style={{
              borderColor: autoDetect ? 'var(--brand)' : 'var(--surface-3)',
              backgroundColor: autoDetect ? 'var(--brand-light)' : 'var(--surface-1)',
              color: autoDetect ? 'var(--brand)' : 'var(--text-3)',
            }}
          >
            <Wand2 className="w-4 h-4" />
            <span className="text-sm font-medium flex-1 text-left">
              Not sure? Let AI recommend specs based on references
            </span>
            {autoDetect && <Check className="w-4 h-4" />}
          </button>

          {/* Spec grid grouped by platform */}
          <div className="space-y-5 max-h-[480px] overflow-y-auto pr-2">
            {grouped.size === 0 && (
              <div className="text-center text-sm py-8" style={{ color: 'var(--text-4)' }}>
                No matching specs. Try toggling &quot;Show All&quot;.
              </div>
            )}
            {Array.from(grouped.entries()).map(([platform, specs]) => (
              <div key={platform}>
                <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-4)' }}>
                  {PLATFORM_LABELS[platform]}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {specs.map(spec => {
                    const selected = selectedSpecIds.includes(spec.id)
                    return (
                      <button
                        key={spec.id}
                        onClick={() => toggleSpec(spec.id)}
                        className="group text-left p-2.5 rounded-lg border transition-all flex items-center gap-2.5"
                        style={{
                          borderColor: selected ? 'var(--brand)' : 'var(--surface-3)',
                          backgroundColor: selected ? 'var(--brand-light)' : 'var(--surface-1)',
                          boxShadow: selected ? '0 0 0 2px rgba(192,228,99,0.15)' : 'none',
                        }}
                      >
                        {/* Aspect ratio preview box */}
                        <div className="flex-shrink-0 flex items-center justify-center">
                          <div
                            style={{
                              ...ratioBoxStyle(spec.width, spec.height),
                              backgroundColor: selected ? 'var(--brand)' : 'var(--border-strong)',
                              borderRadius: '4px',
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-1)' }}>{spec.nameZh}</div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--text-4)' }}>
                            {spec.width}×{spec.height} · {spec.aspectRatio}
                            {spec.maxDurationSec && ` · ≤${spec.maxDurationSec}s`}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── RIGHT: Multimodal Intake ───────────────────────────────────── */}
        <section className="rounded-lg border p-5" style={{ background: 'var(--surface-1)', borderColor: 'var(--surface-3)', boxShadow: 'var(--shadow-lg)' }}>
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>References & Description</h2>

          {/* Text description */}
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>Description</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="E.g. iGaming new user promo, 100% first deposit bonus, target Southeast Asia males 25-34, playful tone, dark theme, CTA is Get Now…"
            rows={5}
            className="w-full px-4 py-3 rounded-lg border text-sm outline-none resize-none"
            style={{
              borderColor: 'var(--surface-3)',
              backgroundColor: 'var(--surface-1)',
              color: 'var(--text-1)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--brand)'
              e.currentTarget.style.backgroundColor = 'var(--surface-2)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--surface-3)'
              e.currentTarget.style.backgroundColor = 'var(--surface-1)'
            }}
          />

          {/* URLs */}
          <label className="block text-xs font-semibold uppercase tracking-wider mt-5 mb-1.5" style={{ color: 'var(--text-3)' }}>Reference URLs</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-4)' }} />
              <input
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUrl())}
                placeholder="https://example.com/campaign"
                className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border outline-none"
                style={{
                  borderColor: 'var(--surface-3)',
                  backgroundColor: 'var(--surface-1)',
                  color: 'var(--text-1)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--brand)'
                  e.currentTarget.style.backgroundColor = 'var(--surface-2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--surface-3)'
                  e.currentTarget.style.backgroundColor = 'var(--surface-1)'
                }}
              />
            </div>
            <button
              onClick={addUrl}
              className="px-4 py-2 text-sm font-medium rounded-lg transition"
              style={{
                backgroundColor: 'var(--surface-1)',
                color: 'var(--text-2)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-3)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-1)'}
            >
              Add
            </button>
          </div>
          {urls.length > 0 && (
            <ul className="mt-2 space-y-1">
              {urls.map((u, i) => (
                <li key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--surface-1)', color: 'var(--text-2)' }}>
                  <Link2 className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-4)' }} />
                  <span className="truncate flex-1">{u}</span>
                  <button onClick={() => removeUrl(i)} className="transition" style={{ color: 'var(--text-4)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-4)'}>
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* File uploads */}
          <label className="block text-xs font-semibold uppercase tracking-wider mt-5 mb-1.5" style={{ color: 'var(--text-3)' }}>Reference Files</label>
          <div className="grid grid-cols-2 gap-2">
            <UploadButton icon={<ImageIcon className="w-4 h-4" />} label="Upload Image" accept="image/*" onChange={e => onFileSelect(e, 'image')} />
            <UploadButton icon={<Video className="w-4 h-4" />} label="Upload Video" accept="video/*" onChange={e => onFileSelect(e, 'video')} />
          </div>
          {uploadingCount > 0 && (
            <p className="mt-2 text-xs animate-pulse" style={{ color: 'var(--brand)' }}>
              Uploading {uploadingCount} file{uploadingCount !== 1 ? 's' : ''}…
            </p>
          )}
          {(uploadedImages.length > 0 || uploadedVideos.length > 0) && (
            <ul className="mt-2 space-y-2">
              {uploadedImages.map((a, i) => (
                <li key={`i-${a.id}`} className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--surface-1)', color: 'var(--text-2)' }}>
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-4)' }} />
                    <a href={a.url} target="_blank" rel="noreferrer" className="truncate flex-1 transition" style={{ color: 'var(--brand)' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
                      {a.filename || a.id}
                      {a.width && a.height ? <span className="ml-1" style={{ color: 'var(--text-4)' }}>{a.width}×{a.height}</span> : null}
                    </a>
                    <span style={{ color: 'var(--text-4)' }}>{((a.size || 0) / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i, 'image')} className="transition" style={{ color: 'var(--text-4)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-4)'}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {a.validations && a.validations.length > 0 && (
                    <SpecValidationBadge validations={a.validations} />
                  )}
                </li>
              ))}
              {uploadedVideos.map((a, i) => (
                <li key={`v-${a.id}`} className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--surface-1)', color: 'var(--text-2)' }}>
                  <div className="flex items-center gap-2">
                    <Video className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-4)' }} />
                    <a href={a.url} target="_blank" rel="noreferrer" className="truncate flex-1 transition" style={{ color: 'var(--brand)' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
                      {a.filename || a.id}
                    </a>
                    <span style={{ color: 'var(--text-4)' }}>{((a.size || 0) / 1024 / 1024).toFixed(1)} MB</span>
                    <button onClick={() => removeFile(i, 'video')} className="transition" style={{ color: 'var(--text-4)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-4)'}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {a.validations && a.validations.length > 0 && (
                    <SpecValidationBadge validations={a.validations} />
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Submit */}
          <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--surface-3)' }}>
            {error && (
              <div className="mb-3 px-3 py-2 text-xs rounded-lg border" style={{ color: 'var(--danger)', borderColor: 'rgba(255,82,82,0.2)', backgroundColor: 'var(--danger-bg)' }}>
                {error}
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3 rounded-full text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                backgroundColor: canSubmit ? 'var(--brand)' : 'var(--surface-1)',
                color: canSubmit ? 'var(--brand-contrast)' : 'var(--text-5)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit ? '0 8px 32px rgba(192,228,99,0.25)' : 'none',
              }}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Parsing with AI…</>
              ) : (
                <>Next: AI Clarification <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
            <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-4)' }}>
              We'll analyze your input and ask for essential details before merging
            </p>
          </div>
        </section>
      </div>
      )}

      {/* ── Stage 2 inline result ──────────────────────────────────────── */}
      {clarified && (
        <div className="max-w-[1400px] mx-auto px-6 pb-12">
          <div className="rounded-lg border p-6" style={{ background: 'var(--surface-1)', borderColor: 'var(--surface-3)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Stage 2 · AI Clarification</h2>
              <span className="text-xs" style={{ color: 'var(--text-4)' }}>Brief ID: <code className="font-mono">{clarified.id}</code></span>
            </div>

            {/* Resolved targetSpecs */}
            {clarified.parsedRefs && clarified.parsedRefs.length > 0 && (
              <div className="mb-5">
                <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-4)' }}>
                  Extracted References ({clarified.parsedRefs.length})
                </div>
                <ul className="space-y-2">
                  {clarified.parsedRefs.map((ref, i) => (
                    <li key={i} className="flex gap-3 p-2.5 rounded-lg border" style={{ background: 'var(--surface-1)', borderColor: 'var(--surface-3)' }}>
                      {ref.extractedAssets.heroImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ref.extractedAssets.heroImage}
                          alt=""
                          className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                          style={{ backgroundColor: 'var(--surface-1)' }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-md flex-shrink-0" style={{ backgroundColor: 'var(--surface-1)' }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded font-medium uppercase" style={{ backgroundColor: 'var(--surface-1)', color: 'var(--text-1)' }}>
                            {ref.pageType}
                          </span>
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate transition"
                            style={{ color: 'var(--brand)' }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                          >
                            {ref.url}
                          </a>
                        </div>
                        {ref.extractedAssets.copy?.title && (
                          <div className="text-sm font-medium line-clamp-1 mt-0.5" style={{ color: 'var(--text-1)' }}>
                            {ref.extractedAssets.copy.title}
                          </div>
                        )}
                        {ref.extractedAssets.copy?.body && (
                          <div className="text-xs line-clamp-2 mt-0.5" style={{ color: 'var(--text-4)' }}>
                            {ref.extractedAssets.copy.body}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {clarified.targetSpecs.length > 0 && (
              <div className="mb-5">
                <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-4)' }}>Locked Specs</div>
                <div className="flex flex-wrap gap-1.5">
                  {clarified.targetSpecs.map(id => {
                    const s = ASSET_SPECS.find(x => x.id === id)
                    return (
                      <span key={id} className="text-xs px-2.5 py-1 rounded-full border" style={{ backgroundColor: 'var(--brand-light)', borderColor: 'var(--brand)', color: 'var(--brand)' }}>
                        {s?.nameZh ?? id}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pending questions */}
            {clarified.pendingQuestions.length === 0 ? (
              <div className="text-sm rounded-lg px-4 py-3 border" style={{ color: 'var(--brand)', borderColor: 'rgba(192,228,99,0.2)', backgroundColor: 'var(--brand-light)' }}>
                ✓ No clarification needed. Ready to move to Stage 3.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>We need your input ({clarified.pendingQuestions.length})</div>
                {clarified.pendingQuestions.map(q => (
                  <div key={q.id} className="border rounded-lg p-4" style={{ borderColor: 'var(--surface-3)' }}>
                    <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                      {q.question}
                      {q.required && <span className="ml-1" style={{ color: 'var(--danger)' }}>*</span>}
                    </div>
                    {q.choices && q.choices.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {q.choices.map(choice => {
                          const active = answers[q.id] === choice
                          return (
                            <button
                              key={choice}
                              onClick={() => setAnswer(q.id, choice)}
                              className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                              style={{
                                backgroundColor: active ? 'var(--brand)' : 'var(--surface-1)',
                                color: active ? 'var(--brand-contrast)' : 'var(--text-2)',
                                borderColor: active ? 'var(--brand)' : 'var(--surface-3)',
                              }}
                            >
                              {choice}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <input
                        value={answers[q.id] || ''}
                        onChange={e => setAnswer(q.id, e.target.value)}
                        placeholder="Enter…"
                        className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                        style={{
                          borderColor: 'var(--surface-3)',
                          backgroundColor: 'var(--surface-1)',
                          color: 'var(--text-1)',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--brand)'
                          e.currentTarget.style.backgroundColor = 'var(--surface-2)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--surface-3)'
                          e.currentTarget.style.backgroundColor = 'var(--surface-1)'
                        }}
                      />
                    )}
                  </div>
                ))}
                <p className="text-[11px]" style={{ color: 'var(--text-4)' }}>
                  Your answers will be merged into the brief for Stage 3 enrichment.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5"
      style={{
        backgroundColor: active ? 'var(--brand-light)' : 'var(--surface-1)',
        borderColor: active ? 'var(--brand)' : 'var(--surface-3)',
        color: active ? 'var(--brand)' : 'var(--text-2)',
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function UploadButton({
  icon,
  label,
  accept,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  accept: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed text-sm font-medium transition-colors" style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--surface-1)', color: 'var(--text-2)' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-3)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-1)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}>
      <Upload className="w-4 h-4" style={{ color: 'var(--text-4)' }} />
      {icon}
      {label}
      <input type="file" accept={accept} multiple className="hidden" onChange={onChange} />
    </label>
  )
}
