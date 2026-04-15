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
  web: 'Web 落地页',
  email: 'EDM',
  'app-store-ios': 'App Store (iOS)',
  'app-store-android': 'Play Store',
  universal: '通用',
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
      setError('网址需要以 http:// 或 https:// 开头')
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
          throw new Error(data.error || `上传失败 (${res.status})`)
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
        throw new Error(parseData.error || `parse 失败 (${parseRes.status})`)
      }
      setSimpleMeta(parseData.meta)

      const clarifyRes = await fetch('/api/brief/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseData.intake),
      })
      const clarifyData = await clarifyRes.json()
      if (!clarifyRes.ok || !clarifyData.ok) {
        throw new Error(clarifyData.error || `clarify 失败 (${clarifyRes.status})`)
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
        throw new Error(data.error || `服务异常 (${res.status})`)
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #22d3ee, #d946ef)' }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">新建 Brief</h1>
              <p className="text-xs text-slate-500">Stage 1 · 信息采集</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-cyan-500 text-white flex items-center justify-center text-[11px] font-bold">1</span>
              <span className="font-medium text-slate-700">采集</span>
            </div>
            <ChevronRight className="w-3 h-3" />
            <span>2 澄清</span>
            <ChevronRight className="w-3 h-3" />
            <span>3 合并</span>
            <ChevronRight className="w-3 h-3" />
            <span>4 生成</span>
          </div>
        </div>
      </header>

      {/* Mode switcher */}
      <div className="max-w-[1400px] mx-auto px-6 pt-6 pb-2">
        <div className="inline-flex items-center bg-white border border-slate-200 rounded-full p-1 text-xs font-medium">
          <button
            onClick={() => setMode('simple')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition ${
              mode === 'simple'
                ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> 简洁模式
          </button>
          <button
            onClick={() => setMode('advanced')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition ${
              mode === 'advanced'
                ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> 专家模式
          </button>
          <span className="text-[11px] text-slate-400 pl-3 pr-3">
            {mode === 'simple'
              ? '一句话就能起 brief，AI 帮你挑规格、抓参考'
              : '手动挑规格 · 手动上传参考素材 · 全流程可控'}
          </span>
        </div>
      </div>

      {/* Simple mode */}
      {mode === 'simple' && (
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              告诉 AI 你想做什么
            </label>
            <p className="text-xs text-slate-500 mb-4">
              例如：<span className="italic text-slate-600">「给新注册玩家做个抖音 15 秒注册送 50 块的短视频，参考 https://example.com」</span>
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
                placeholder="用一句话描述你的需求，可以带 URL"
                rows={4}
                className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent placeholder:text-slate-400"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {simpleInput.length} / 4000 · ⌘↵ 发送
                </span>
                <button
                  onClick={handleSimpleSubmit}
                  disabled={!simpleInput.trim() || submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                  style={{ background: 'linear-gradient(135deg, #22d3ee, #d946ef)' }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> 解析中
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> 发送
                    </>
                  )}
                </button>
              </div>
            </div>
            {simpleMeta && (
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono">
                    {simpleMeta.engine}
                  </span>
                  <span>置信度 {(simpleMeta.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="text-slate-500">{simpleMeta.reasoning}</div>
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
                {error}
              </div>
            )}
          </section>
        </div>
      )}

      {mode === 'advanced' && (
      <div className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">

        {/* ── LEFT: Spec Picker ──────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">我想要做什么？</h2>
            <span className="text-xs text-slate-500">{selectedSpecIds.length} 已选 · {visibleSpecs.length} / {ASSET_SPECS.length} 显示</span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索规格名称、平台或宽高比 (如 9:16)"
              className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-cyan-400 focus:bg-white"
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <FilterChip active={mediaFilter === 'all'} onClick={() => setMediaFilter('all')}>全部</FilterChip>
            <FilterChip active={mediaFilter === 'image'} onClick={() => setMediaFilter('image')} icon={<ImageIcon className="w-3 h-3" />}>图片</FilterChip>
            <FilterChip active={mediaFilter === 'video'} onClick={() => setMediaFilter('video')} icon={<Video className="w-3 h-3" />}>视频</FilterChip>

            <span className="w-px h-4 bg-slate-200 mx-1" />

            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value as Platform | 'all')}
              className="text-xs px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">所有平台</option>
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            <button
              onClick={() => setShowAll(s => !s)}
              className="text-xs px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-cyan-400"
            >
              {showAll ? '只看常用' : `展开全部 (${ASSET_SPECS.length})`}
            </button>
          </div>

          {/* AI auto-detect option */}
          <button
            onClick={() => setAutoDetect(a => !a)}
            className={`w-full mb-4 px-4 py-3 rounded-xl border-2 border-dashed transition-all flex items-center gap-3 ${
              autoDetect
                ? 'border-cyan-400 bg-cyan-50 text-cyan-900'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
            }`}
          >
            <Wand2 className={`w-4 h-4 ${autoDetect ? 'text-cyan-600' : 'text-slate-400'}`} />
            <span className="text-sm font-medium flex-1 text-left">
              不确定？让 AI 根据参考资料帮我推荐规格
            </span>
            {autoDetect && <Check className="w-4 h-4 text-cyan-600" />}
          </button>

          {/* Spec grid grouped by platform */}
          <div className="space-y-5 max-h-[480px] overflow-y-auto pr-2">
            {grouped.size === 0 && (
              <div className="text-center text-sm text-slate-400 py-8">
                没有匹配的规格。试试切换 &quot;展开全部&quot;。
              </div>
            )}
            {Array.from(grouped.entries()).map(([platform, specs]) => (
              <div key={platform}>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  {PLATFORM_LABELS[platform]}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {specs.map(spec => {
                    const selected = selectedSpecIds.includes(spec.id)
                    return (
                      <button
                        key={spec.id}
                        onClick={() => toggleSpec(spec.id)}
                        className={`group text-left p-2.5 rounded-lg border transition-all flex items-center gap-2.5 ${
                          selected
                            ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-100'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* Aspect ratio preview box */}
                        <div className="flex-shrink-0 flex items-center justify-center">
                          <div
                            style={ratioBoxStyle(spec.width, spec.height)}
                            className={`rounded ${
                              selected
                                ? 'bg-gradient-to-br from-cyan-400 to-fuchsia-400'
                                : 'bg-slate-200 group-hover:bg-slate-300'
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 truncate">{spec.nameZh}</div>
                          <div className="text-[10px] text-slate-500 truncate">
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
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">参考资料 & 描述</h2>

          {/* Text description */}
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">需求描述</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="例：iGaming 客户首存活动，主推 100% 首充返利，目标东南亚 25-34 男性玩家，调性活泼、暗色系，CTA 是「立即领取」..."
            rows={5}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-cyan-400 focus:bg-white resize-none"
          />

          {/* URLs */}
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mt-5 mb-1.5">参考网址</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUrl())}
                placeholder="https://competitor.com/promo"
                className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-cyan-400 focus:bg-white"
              />
            </div>
            <button
              onClick={addUrl}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              添加
            </button>
          </div>
          {urls.length > 0 && (
            <ul className="mt-2 space-y-1">
              {urls.map((u, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg">
                  <Link2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="truncate flex-1">{u}</span>
                  <button onClick={() => removeUrl(i)} className="text-slate-400 hover:text-rose-500">
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* File uploads */}
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mt-5 mb-1.5">参考素材</label>
          <div className="grid grid-cols-2 gap-2">
            <UploadButton icon={<ImageIcon className="w-4 h-4" />} label="上传图片" accept="image/*" onChange={e => onFileSelect(e, 'image')} />
            <UploadButton icon={<Video className="w-4 h-4" />} label="上传视频" accept="video/*" onChange={e => onFileSelect(e, 'video')} />
          </div>
          {uploadingCount > 0 && (
            <p className="mt-2 text-xs text-cyan-600 animate-pulse">
              正在上传 {uploadingCount} 个文件…
            </p>
          )}
          {(uploadedImages.length > 0 || uploadedVideos.length > 0) && (
            <ul className="mt-2 space-y-2">
              {uploadedImages.map((a, i) => (
                <li key={`i-${a.id}`} className="text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="truncate flex-1 hover:text-cyan-600">
                      {a.filename || a.id}
                      {a.width && a.height ? <span className="text-slate-400 ml-1">{a.width}×{a.height}</span> : null}
                    </a>
                    <span className="text-slate-400">{((a.size || 0) / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i, 'image')} className="text-slate-400 hover:text-rose-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {a.validations && a.validations.length > 0 && (
                    <SpecValidationBadge validations={a.validations} />
                  )}
                </li>
              ))}
              {uploadedVideos.map((a, i) => (
                <li key={`v-${a.id}`} className="text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Video className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="truncate flex-1 hover:text-cyan-600">
                      {a.filename || a.id}
                    </a>
                    <span className="text-slate-400">{((a.size || 0) / 1024 / 1024).toFixed(1)} MB</span>
                    <button onClick={() => removeFile(i, 'video')} className="text-slate-400 hover:text-rose-500">
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
          <div className="mt-6 pt-5 border-t border-slate-100">
            {error && (
              <div className="mb-3 px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg">
                {error}
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: canSubmit
                  ? 'linear-gradient(90deg, #22d3ee 0%, #a855f7 50%, #d946ef 100%)'
                  : '#cbd5e1',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit ? '0 8px 24px -8px rgba(168, 85, 247, 0.5)' : 'none',
              }}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 让 AI 解析中...</>
              ) : (
                <>下一步：AI 澄清 <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              我们会用 LLM 分析你的输入，反问你必要的字段，再进入合并阶段
            </p>
          </div>
        </section>
      </div>
      )}

      {/* ── Stage 2 inline result ──────────────────────────────────────── */}
      {clarified && (
        <div className="max-w-[1400px] mx-auto px-6 pb-12">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Stage 2 · AI 澄清</h2>
              <span className="text-xs text-slate-500">Brief ID: <code className="font-mono">{clarified.id}</code></span>
            </div>

            {/* Resolved targetSpecs */}
            {clarified.parsedRefs && clarified.parsedRefs.length > 0 && (
              <div className="mb-5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  已抓取的参考 ({clarified.parsedRefs.length})
                </div>
                <ul className="space-y-2">
                  {clarified.parsedRefs.map((ref, i) => (
                    <li key={i} className="flex gap-3 p-2.5 rounded-lg border border-slate-200 bg-white">
                      {ref.extractedAssets.heroImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ref.extractedAssets.heroImage}
                          alt=""
                          className="w-16 h-16 object-cover rounded-md flex-shrink-0 bg-slate-100"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-md bg-slate-100 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium uppercase">
                            {ref.pageType}
                          </span>
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 truncate hover:text-cyan-600"
                          >
                            {ref.url}
                          </a>
                        </div>
                        {ref.extractedAssets.copy?.title && (
                          <div className="text-sm font-medium text-slate-900 line-clamp-1 mt-0.5">
                            {ref.extractedAssets.copy.title}
                          </div>
                        )}
                        {ref.extractedAssets.copy?.body && (
                          <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">
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
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">已锁定规格</div>
                <div className="flex flex-wrap gap-1.5">
                  {clarified.targetSpecs.map(id => {
                    const s = ASSET_SPECS.find(x => x.id === id)
                    return (
                      <span key={id} className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-900">
                        {s?.nameZh ?? id}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pending questions */}
            {clarified.pendingQuestions.length === 0 ? (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
                ✓ 没有需要澄清的字段，可以进入 Stage 3 信息合并。
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">还需要你回答 ({clarified.pendingQuestions.length})</div>
                {clarified.pendingQuestions.map(q => (
                  <div key={q.id} className="border border-slate-200 rounded-xl p-4">
                    <div className="text-sm font-medium text-slate-900 mb-2">
                      {q.question}
                      {q.required && <span className="text-rose-500 ml-1">*</span>}
                    </div>
                    {q.choices && q.choices.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {q.choices.map(choice => {
                          const active = answers[q.id] === choice
                          return (
                            <button
                              key={choice}
                              onClick={() => setAnswer(q.id, choice)}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                active
                                  ? 'border-cyan-400 bg-cyan-50 text-cyan-900'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              }`}
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
                        placeholder="输入..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-cyan-400 focus:bg-white"
                      />
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">
                  下一步会把这些回答合并进 brief，进入 Stage 3 调用三库做信息补全（待实现）。
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
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
        active
          ? 'border-cyan-400 bg-cyan-50 text-cyan-900'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
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
    <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 transition-colors text-sm text-slate-700 font-medium">
      <Upload className="w-4 h-4 text-slate-500" />
      {icon}
      {label}
      <input type="file" accept={accept} multiple className="hidden" onChange={onChange} />
    </label>
  )
}
