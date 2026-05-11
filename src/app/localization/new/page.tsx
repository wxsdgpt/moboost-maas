'use client'

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale } from '@/lib/i18n/LocaleProvider'
import {
  Upload, FileImage, FileVideo, FileText, Layers, ChevronLeft, ChevronRight,
  Check, X, Globe, Zap, Clock, ArrowRight, Loader2, Building2, FolderOpen, Plus
} from 'lucide-react'
import {
  createJob, submitJob, uploadAsset, uploadText, ingestFromUrl,
  getBrands, createBrand, getProjects, createProject, getAssets, getMarkets,
  type SourceAssetListItem, type Project,
} from '@/lib/localization/client'

/* ─── Constants ─── */

const SF_DISPLAY = 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif'
const SF_TEXT = 'SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif'

const ACCEPTED_EXTENSIONS = ['.psd', '.png', '.jpg', '.jpeg', '.mp4', '.txt', '.md', '.csv']

type FileType = 'psd' | 'image' | 'video' | 'text'

function getFileType(name: string): FileType {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'psd') return 'psd'
  if (ext === 'mp4') return 'video'
  if (['txt', 'md', 'csv'].includes(ext)) return 'text'
  return 'image'
}

const FILE_TYPE_STYLES: Record<FileType, { label: string; bg: string; color: string }> = {
  psd: { label: 'PSD', bg: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' },
  image: { label: 'Image', bg: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa' },
  video: { label: 'Video', bg: 'rgba(251, 146, 60, 0.12)', color: '#fb923c' },
  text: { label: 'Text', bg: 'rgba(52, 199, 89, 0.12)', color: '#34c759' },
}

interface SelectedFile {
  name: string
  size: number
  type: FileType
  dimensions?: string
  file?: File
  assetId?: string   // set when selecting an existing asset from project
}

/* ─── Market metadata (flags & names for display) ─── */
const MARKET_META: Record<string, { flag: string; name: string; complexity: string }> = {
  US: { flag: '\u{1F1FA}\u{1F1F8}', name: 'United States', complexity: 'High' },
  UK: { flag: '\u{1F1EC}\u{1F1E7}', name: 'United Kingdom', complexity: 'Medium' },
  PH: { flag: '\u{1F1F5}\u{1F1ED}', name: 'Philippines', complexity: 'Low' },
  IN: { flag: '\u{1F1EE}\u{1F1F3}', name: 'India', complexity: 'High' },
  BR: { flag: '\u{1F1E7}\u{1F1F7}', name: 'Brazil', complexity: 'Medium' },
  FR: { flag: '\u{1F1EB}\u{1F1F7}', name: 'France', complexity: 'Medium' },
  DE: { flag: '\u{1F1E9}\u{1F1EA}', name: 'Germany', complexity: 'Medium' },
  NG: { flag: '\u{1F1F3}\u{1F1EC}', name: 'Nigeria', complexity: 'Low' },
}

const CONTENT_TYPES = ['Text', 'Visual', 'Audio'] as const
const STRATEGIES = ['keep', 'literal', 'light', 'transcreate'] as const
type Strategy = typeof STRATEGIES[number]

const STRATEGY_COLORS: Record<Strategy, { bg: string; color: string }> = {
  keep: { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-3)' },
  literal: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa' },
  light: { bg: 'rgba(192,228,99,0.12)', color: 'var(--brand)' },
  transcreate: { bg: 'rgba(251,146,60,0.12)', color: '#fb923c' },
}

function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

/* ─── Component ─── */

export default function NewLocalizationJobPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLocale()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 1 = Brand & Project, Step 2 = Source Asset, Step 3 = Target Markets, Step 4 = Strategy, Step 5 = Confirm
  const TOTAL_STEPS = 5
  const [step, setStep] = useState(1)

  // Step 1: Brand & Project
  const [brands, setBrands] = useState<{ id: string; name: string; slug: string }[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [brandsLoading, setBrandsLoading] = useState(true)
  const [creatingBrand, setCreatingBrand] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)

  // Step 2: Source Asset
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [existingAssets, setExistingAssets] = useState<SourceAssetListItem[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)

  // Step 3: Target Markets
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([])
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set())
  const [marketsLoading, setMarketsLoading] = useState(false)

  // Step 4: Strategy
  const [strategyMatrix, setStrategyMatrix] = useState<Record<string, Record<string, Strategy>>>({})

  // Step 5: Confirm
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load brands on mount
  useEffect(() => {
    let cancelled = false
    async function loadBrands() {
      try {
        const data = await getBrands()
        if (!cancelled) {
          setBrands(data)
          // Auto-select if exactly one brand
          if (data.length === 1) {
            setSelectedBrandId(data[0].id)
          }
        }
      } catch (e) {
        if (!cancelled) setSetupError(e instanceof Error ? e.message : 'Failed to load brands')
      } finally {
        if (!cancelled) setBrandsLoading(false)
      }
    }
    loadBrands()
    return () => { cancelled = true }
  }, [])

  // Load projects when brand is selected
  useEffect(() => {
    if (!selectedBrandId) { setProjects([]); return }
    let cancelled = false
    async function loadProjects() {
      try {
        const data = await getProjects(selectedBrandId!)
        if (!cancelled) {
          setProjects(data)
          if (data.length === 1) {
            setSelectedProjectId(data[0].id)
          }
        }
      } catch {
        if (!cancelled) setProjects([])
      }
    }
    loadProjects()
    return () => { cancelled = true }
  }, [selectedBrandId])

  // Load existing assets when project is selected and we enter step 2
  useEffect(() => {
    if (!selectedProjectId || step !== 2) return
    let cancelled = false
    setAssetsLoading(true)
    async function loadAssets() {
      try {
        const data = await getAssets(selectedProjectId!)
        if (!cancelled) setExistingAssets(data)
      } catch {
        if (!cancelled) setExistingAssets([])
      } finally {
        if (!cancelled) setAssetsLoading(false)
      }
    }
    loadAssets()
    return () => { cancelled = true }
  }, [selectedProjectId, step])

  // Load markets when entering step 3
  useEffect(() => {
    if (step !== 3) return
    let cancelled = false
    setMarketsLoading(true)
    async function loadMarkets() {
      try {
        const data = await getMarkets()
        if (!cancelled) {
          setAvailableMarkets(data.map(m => m.code))
        }
      } catch {
        // Fall back to hardcoded markets
        if (!cancelled) setAvailableMarkets(Object.keys(MARKET_META))
      } finally {
        if (!cancelled) setMarketsLoading(false)
      }
    }
    loadMarkets()
    return () => { cancelled = true }
  }, [step])

  // Read URL params from Localize buttons (sourceUrl, assetId, type, projectId)
  useEffect(() => {
    const sourceUrl = searchParams.get('sourceUrl')
    const assetType = searchParams.get('type') as FileType | null
    const assetId = searchParams.get('assetId')
    const projectId = searchParams.get('projectId')
    if (sourceUrl) {
      const filename = sourceUrl.split('/').pop() || 'asset'
      setSelectedFile({
        name: filename,
        size: 0,
        type: assetType || 'image',
        assetId: assetId || undefined,
      })
    }
    if (projectId) {
      setSelectedProjectId(projectId)
    }
  }, [searchParams])

  /* ─── Brand/Project creation ─── */

  async function handleCreateBrand() {
    if (!newBrandName.trim()) return
    setCreatingBrand(true)
    setSetupError(null)
    try {
      const slug = newBrandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const brand = await createBrand({ name: newBrandName.trim(), slug })
      setBrands(prev => [...prev, brand])
      setSelectedBrandId(brand.id)
      setNewBrandName('')
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Failed to create brand')
    } finally {
      setCreatingBrand(false)
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim() || !selectedBrandId) return
    setCreatingProject(true)
    setSetupError(null)
    try {
      const proj = await createProject({ brand_id: selectedBrandId, name: newProjectName.trim() })
      setProjects(prev => [...prev, proj])
      setSelectedProjectId(proj.id)
      setNewProjectName('')
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setCreatingProject(false)
    }
  }

  /* ─── File handling ─── */

  function handleFileDrop(e: DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function processFile(file: File) {
    const ftype = getFileType(file.name)
    setSelectedFile({ name: file.name, size: file.size, type: ftype, file })
  }

  function selectExistingAsset(asset: SourceAssetListItem) {
    const ftype = getFileType(asset.original_filename)
    setSelectedFile({
      name: asset.original_filename,
      size: asset.file_size_bytes,
      type: ftype,
      assetId: asset.id,
    })
  }

  /* ─── Market selection ─── */

  function toggleMarket(id: string) {
    setSelectedMarkets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllMarkets() {
    setSelectedMarkets(new Set(availableMarkets))
  }

  function deselectAllMarkets() {
    setSelectedMarkets(new Set())
  }

  /* ─── Strategy matrix init ─── */

  function initStrategyMatrix() {
    const matrix: Record<string, Record<string, Strategy>> = {}
    for (const ct of CONTENT_TYPES) {
      matrix[ct] = {}
      for (const mid of Array.from(selectedMarkets)) {
        matrix[ct][mid] = ct === 'Text' ? 'transcreate' : ct === 'Visual' ? 'light' : 'keep'
      }
    }
    setStrategyMatrix(matrix)
  }

  function cycleStrategy(contentType: string, marketId: string) {
    setStrategyMatrix(prev => {
      const next = { ...prev, [contentType]: { ...prev[contentType] } }
      const current = next[contentType][marketId]
      const idx = STRATEGIES.indexOf(current)
      next[contentType][marketId] = STRATEGIES[(idx + 1) % STRATEGIES.length]
      return next
    })
  }

  /* ─── Navigation ─── */

  function canAdvance(): boolean {
    if (step === 1) return selectedBrandId !== null && selectedProjectId !== null
    if (step === 2) return selectedFile !== null
    if (step === 3) return selectedMarkets.size > 0
    return true
  }

  function goNext() {
    if (!canAdvance()) return
    if (step === 3) initStrategyMatrix()
    setStep(s => Math.min(s + 1, TOTAL_STEPS))
  }

  function goBack() {
    setStep(s => Math.max(s - 1, 1))
  }

  /* ─── Shared card style ─── */

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface-1)',
    backdropFilter: 'saturate(120%) blur(24px)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
  }

  /* ─── Step Indicator ─── */

  function StepIndicator() {
    const labels = ['Brand & Project', 'Source Asset', 'Target Markets', 'Strategy', 'Confirm']
    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {labels.map((label, i) => {
          const num = i + 1
          const isActive = num === step
          const isCompleted = num < step
          return (
            <div key={num} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  style={{
                    width: 24,
                    height: 1,
                    background: isCompleted ? 'var(--brand)' : 'var(--border)',
                  }}
                />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: SF_TEXT,
                    background: isActive || isCompleted ? 'var(--brand)' : 'var(--surface-2)',
                    color: isActive || isCompleted ? 'var(--brand-contrast)' : 'var(--text-3)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : num}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    fontFamily: SF_TEXT,
                    color: isActive ? 'var(--text-1)' : 'var(--text-3)',
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

  /* ─── Step 1: Brand & Project ─── */

  function Step1() {
    return (
      <div>
        <h2
          className="mb-6"
          style={{ fontFamily: SF_DISPLAY, fontSize: 28, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.3px' }}
        >
          Select Brand & Project
        </h2>

        {brandsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-3)' }} />
          </div>
        ) : (
          <>
            {/* Brand selection */}
            <div className="mb-8">
              <label className="block mb-3" style={{ fontFamily: SF_TEXT, fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>
                <Building2 className="w-4 h-4 inline mr-2" style={{ verticalAlign: 'middle' }} />
                Brand
              </label>
              {brands.length > 0 ? (
                <div className="flex flex-wrap gap-3 mb-4">
                  {brands.map(b => (
                    <button
                      key={b.id}
                      onClick={() => { setSelectedBrandId(b.id); setSelectedProjectId(null) }}
                      className="px-5 py-3 rounded-xl text-sm transition-all"
                      style={{
                        ...cardStyle,
                        fontFamily: SF_TEXT,
                        fontWeight: 500,
                        borderColor: selectedBrandId === b.id ? 'var(--brand)' : 'var(--border)',
                        background: selectedBrandId === b.id ? 'rgba(192,228,99,0.04)' : 'var(--surface-1)',
                        color: selectedBrandId === b.id ? 'var(--text-1)' : 'var(--text-2)',
                      }}
                    >
                      {selectedBrandId === b.id && <Check className="w-3.5 h-3.5 inline mr-1.5" style={{ color: 'var(--brand)' }} />}
                      {b.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mb-4 text-sm" style={{ fontFamily: SF_TEXT, color: 'var(--text-3)' }}>
                  No brands found. Create one below to get started.
                </p>
              )}
              {/* Create new brand */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New brand name..."
                  value={newBrandName}
                  onChange={e => setNewBrandName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateBrand()}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                  style={{
                    fontFamily: SF_TEXT,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleCreateBrand}
                  disabled={!newBrandName.trim() || creatingBrand}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-colors"
                  style={{
                    fontFamily: SF_TEXT,
                    fontWeight: 600,
                    background: newBrandName.trim() ? 'var(--brand)' : 'var(--surface-2)',
                    color: newBrandName.trim() ? 'var(--brand-contrast)' : 'var(--text-3)',
                    border: 'none',
                  }}
                >
                  {creatingBrand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Create
                </button>
              </div>
            </div>

            {/* Project selection (only when brand is selected) */}
            {selectedBrandId && (
              <div>
                <label className="block mb-3" style={{ fontFamily: SF_TEXT, fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>
                  <FolderOpen className="w-4 h-4 inline mr-2" style={{ verticalAlign: 'middle' }} />
                  Project
                </label>
                {projects.length > 0 ? (
                  <div className="flex flex-wrap gap-3 mb-4">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className="px-5 py-3 rounded-xl text-sm transition-all"
                        style={{
                          ...cardStyle,
                          fontFamily: SF_TEXT,
                          fontWeight: 500,
                          borderColor: selectedProjectId === p.id ? 'var(--brand)' : 'var(--border)',
                          background: selectedProjectId === p.id ? 'rgba(192,228,99,0.04)' : 'var(--surface-1)',
                          color: selectedProjectId === p.id ? 'var(--text-1)' : 'var(--text-2)',
                        }}
                      >
                        {selectedProjectId === p.id && <Check className="w-3.5 h-3.5 inline mr-1.5" style={{ color: 'var(--brand)' }} />}
                        {p.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mb-4 text-sm" style={{ fontFamily: SF_TEXT, color: 'var(--text-3)' }}>
                    No projects in this brand. Create one below.
                  </p>
                )}
                {/* Create new project */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New project name..."
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                    style={{
                      fontFamily: SF_TEXT,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-1)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim() || creatingProject}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-colors"
                    style={{
                      fontFamily: SF_TEXT,
                      fontWeight: 600,
                      background: newProjectName.trim() ? 'var(--brand)' : 'var(--surface-2)',
                      color: newProjectName.trim() ? 'var(--brand-contrast)' : 'var(--text-3)',
                      border: 'none',
                    }}
                  >
                    {creatingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {setupError && (
              <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }}>
                {setupError}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  /* ─── Step 2: Select Source Asset ─── */

  function Step2() {
    const fileIcon = (type: FileType) => {
      if (type === 'video') return <FileVideo className="w-5 h-5" style={{ color: '#fb923c' }} />
      if (type === 'psd') return <Layers className="w-5 h-5" style={{ color: '#c084fc' }} />
      if (type === 'text') return <FileText className="w-5 h-5" style={{ color: '#34c759' }} />
      return <FileImage className="w-5 h-5" style={{ color: '#60a5fa' }} />
    }

    return (
      <div>
        <h2
          className="mb-6"
          style={{ fontFamily: SF_DISPLAY, fontSize: 28, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.3px' }}
        >
          Select Source Asset
        </h2>

        {/* Upload zone */}
        <div
          className="relative mb-8 p-10 text-center cursor-pointer transition-all"
          style={{
            ...cardStyle,
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: isDragging ? 'var(--brand)' : 'var(--border)',
            background: isDragging ? 'rgba(192,228,99,0.04)' : 'var(--surface-1)',
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={handleFileInput}
          />
          <Upload
            className="mx-auto mb-3"
            style={{ width: 36, height: 36, color: isDragging ? 'var(--brand)' : 'var(--text-3)' }}
          />
          <p style={{ fontFamily: SF_TEXT, fontSize: 15, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
            Drag & drop your file here, or click to browse
          </p>
          <p style={{ fontFamily: SF_TEXT, fontSize: 13, color: 'var(--text-3)' }}>
            Supports PSD, PNG, JPG, MP4, TXT, MD, CSV
          </p>
        </div>

        {/* Existing assets from project */}
        {(existingAssets.length > 0 || assetsLoading) && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
              <span style={{ fontFamily: SF_TEXT, fontSize: 13, color: 'var(--text-3)' }}>or select from project assets</span>
              <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
            </div>

            {assetsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-3)' }} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {existingAssets.map((asset) => {
                  const ftype = getFileType(asset.original_filename)
                  const isSelected = selectedFile?.assetId === asset.id
                  return (
                    <button
                      key={asset.id}
                      onClick={() => selectExistingAsset(asset)}
                      className="flex items-center gap-4 px-5 py-4 text-left transition-all"
                      style={{
                        ...cardStyle,
                        borderColor: isSelected ? 'var(--brand)' : 'var(--border)',
                        background: isSelected ? 'rgba(192,228,99,0.04)' : 'var(--surface-1)',
                      }}
                    >
                      <div
                        className="flex items-center justify-center flex-shrink-0"
                        style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--surface-3)' }}
                      >
                        {fileIcon(ftype)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate mb-0.5" style={{ fontFamily: SF_TEXT, fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                          {asset.original_filename}
                        </div>
                        <div style={{ fontFamily: SF_TEXT, fontSize: 12, color: 'var(--text-3)' }}>
                          {formatSize(asset.file_size_bytes)} &middot; {asset.parse_status}
                        </div>
                      </div>
                      <span className="inline-block text-xs px-2.5 py-1 rounded-full" style={{ background: FILE_TYPE_STYLES[ftype].bg, color: FILE_TYPE_STYLES[ftype].color, fontFamily: SF_TEXT, fontWeight: 500 }}>
                        {FILE_TYPE_STYLES[ftype].label}
                      </span>
                      {isSelected && (
                        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)' }}>
                          <Check className="w-3.5 h-3.5" style={{ color: 'var(--brand-contrast)' }} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Selected file metadata */}
        {selectedFile && (
          <div className="mt-6 px-5 py-4 flex items-center gap-4" style={{ ...cardStyle, background: 'rgba(192,228,99,0.04)', borderColor: 'rgba(192,228,99,0.15)' }}>
            <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand)' }} />
            <div className="flex-1 min-w-0">
              <span style={{ fontFamily: SF_TEXT, fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                Selected: {selectedFile.name}
              </span>
              <span style={{ fontFamily: SF_TEXT, fontSize: 13, color: 'var(--text-3)', marginLeft: 8 }}>
                {selectedFile.size > 0 ? formatSize(selectedFile.size) : ''} {FILE_TYPE_STYLES[selectedFile.type].label}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
              className="flex-shrink-0 p-1 rounded-md transition-colors"
              style={{ color: 'var(--text-3)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ─── Step 3: Select Target Markets ─── */

  function Step3() {
    const marketsToShow = availableMarkets.length > 0 ? availableMarkets : Object.keys(MARKET_META)
    const complexityColor = (c: string) =>
      c === 'High' ? '#ff6b6b' : c === 'Medium' ? '#fb923c' : 'var(--brand)'

    return (
      <div>
        <h2 className="mb-2" style={{ fontFamily: SF_DISPLAY, fontSize: 28, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.3px' }}>
          Select Target Markets
        </h2>
        <p className="mb-6" style={{ fontFamily: SF_TEXT, fontSize: 14, color: 'var(--text-3)' }}>
          Choose which markets to localize your asset for.
        </p>

        {marketsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-3)' }} />
          </div>
        ) : (
          <>
            <div className="flex gap-3 mb-5">
              <button
                onClick={selectAllMarkets}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ fontFamily: SF_TEXT, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Select All
              </button>
              <button
                onClick={deselectAllMarkets}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ fontFamily: SF_TEXT, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Deselect All
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {marketsToShow.map((mid) => {
                const meta = MARKET_META[mid] || { flag: '\u{1F30D}', name: mid, complexity: 'Medium' }
                const isSelected = selectedMarkets.has(mid)
                return (
                  <button
                    key={mid}
                    onClick={() => toggleMarket(mid)}
                    className="relative px-4 py-5 text-left transition-all"
                    style={{
                      ...cardStyle,
                      borderColor: isSelected ? 'var(--brand)' : 'var(--border)',
                      background: isSelected ? 'rgba(192,228,99,0.04)' : 'var(--surface-1)',
                    }}
                  >
                    <div
                      className="absolute top-3 right-3 flex items-center justify-center"
                      style={{
                        width: 20, height: 20, borderRadius: 6,
                        border: isSelected ? 'none' : '1.5px solid var(--border-strong)',
                        background: isSelected ? 'var(--brand)' : 'transparent',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isSelected && <Check className="w-3 h-3" style={{ color: 'var(--brand-contrast)' }} />}
                    </div>
                    <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 8 }}>{meta.flag}</div>
                    <div style={{ fontFamily: SF_TEXT, fontSize: 14, fontWeight: 500, color: 'var(--text-1)', marginBottom: 6 }}>
                      {meta.name}
                    </div>
                    <span
                      className="inline-block text-xs px-2 py-0.5 rounded-full"
                      style={{
                        fontFamily: SF_TEXT, fontWeight: 500,
                        color: complexityColor(meta.complexity),
                        background: meta.complexity === 'High' ? 'rgba(255,107,107,0.1)' : meta.complexity === 'Medium' ? 'rgba(251,146,60,0.1)' : 'rgba(192,228,99,0.1)',
                      }}
                    >
                      {meta.complexity} complexity
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  /* ─── Step 4: Configure Strategy ─── */

  function Step4() {
    const marketIds = Array.from(selectedMarkets)

    return (
      <div>
        <h2 className="mb-2" style={{ fontFamily: SF_DISPLAY, fontSize: 28, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.3px' }}>
          Configure Strategy
        </h2>
        <p className="mb-6" style={{ fontFamily: SF_TEXT, fontSize: 14, color: 'var(--text-3)' }}>
          Click any strategy chip to cycle through options. This is a simplified preview.
        </p>

        <div className="overflow-x-auto" style={{ ...cardStyle, padding: 0 }}>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="text-left px-5 py-4" style={{ fontFamily: SF_TEXT, fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' }}>
                  Content Type
                </th>
                {marketIds.map((mid) => {
                  const meta = MARKET_META[mid] || { flag: '\u{1F30D}', name: mid }
                  return (
                    <th key={mid} className="text-center px-3 py-4" style={{ fontFamily: SF_TEXT, fontSize: 12, fontWeight: 600, color: 'var(--text-3)', borderBottom: '1px solid var(--border)', minWidth: 90 }}>
                      <span style={{ fontSize: 16 }}>{meta.flag}</span><br />{meta.name}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {CONTENT_TYPES.map((ct, ri) => (
                <tr key={ct}>
                  <td className="px-5 py-4" style={{ fontFamily: SF_TEXT, fontSize: 14, fontWeight: 500, color: 'var(--text-1)', borderBottom: ri < CONTENT_TYPES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {ct}
                  </td>
                  {marketIds.map((mid) => {
                    const strategy = strategyMatrix[ct]?.[mid] ?? 'keep'
                    const sc = STRATEGY_COLORS[strategy]
                    return (
                      <td key={mid} className="text-center px-3 py-4" style={{ borderBottom: ri < CONTENT_TYPES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <button
                          onClick={() => cycleStrategy(ct, mid)}
                          className="inline-block text-xs px-3 py-1.5 rounded-full transition-all"
                          style={{ fontFamily: SF_TEXT, fontWeight: 500, background: sc.bg, color: sc.color, border: 'none', cursor: 'pointer' }}
                        >
                          {strategy}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 px-5 py-4 flex items-start gap-3" style={{ ...cardStyle, background: 'rgba(192,228,99,0.04)', borderColor: 'rgba(192,228,99,0.12)' }}>
          <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand)' }} />
          <p style={{ fontFamily: SF_TEXT, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Detailed strategy configuration will be available after asset parsing, including per-element overrides, tone calibration, and regulatory compliance checks.
          </p>
        </div>
      </div>
    )
  }

  /* ─── Step 5: Confirm & Start ─── */

  function Step5() {
    const estimatedMinutes = selectedMarkets.size * (selectedFile?.type === 'video' ? 8 : 3)
    const selectedBrand = brands.find(b => b.id === selectedBrandId)
    const selectedProject = projects.find(p => p.id === selectedProjectId)

    return (
      <div>
        <h2 className="mb-6" style={{ fontFamily: SF_DISPLAY, fontSize: 28, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.3px' }}>
          Confirm & Start
        </h2>

        <div className="p-6" style={cardStyle}>
          <div className="flex flex-col gap-5">
            {/* Brand & Project */}
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--brand)' }} />
              <div>
                <div style={{ fontFamily: SF_TEXT, fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>
                  {selectedBrand?.name} / {selectedProject?.name}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Asset */}
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--brand)' }} />
              <div>
                <div style={{ fontFamily: SF_TEXT, fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>
                  {selectedFile?.name}
                </div>
                <div style={{ fontFamily: SF_TEXT, fontSize: 13, color: 'var(--text-3)' }}>
                  {FILE_TYPE_STYLES[selectedFile?.type ?? 'text'].label}
                  {selectedFile && selectedFile.size > 0 ? ` \u00B7 ${formatSize(selectedFile.size)}` : ''}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Markets */}
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--brand)' }} />
              <div>
                <div style={{ fontFamily: SF_TEXT, fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>
                  {selectedMarkets.size} target market{selectedMarkets.size !== 1 ? 's' : ''}
                </div>
                <div style={{ fontFamily: SF_TEXT, fontSize: 13, color: 'var(--text-3)' }}>
                  {Array.from(selectedMarkets)
                    .map(id => { const m = MARKET_META[id]; return m ? `${m.flag} ${m.name}` : id })
                    .join(', ')}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Estimated time */}
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--brand)' }} />
              <div>
                <div style={{ fontFamily: SF_TEXT, fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>
                  Estimated processing time
                </div>
                <div style={{ fontFamily: SF_TEXT, fontSize: 13, color: 'var(--text-3)' }}>
                  ~{estimatedMinutes} minutes
                </div>
              </div>
            </div>
          </div>
        </div>

        {submitError && (
          <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }}>
            {submitError}
          </div>
        )}
        <button
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true)
            setSubmitError(null)
            try {
              const targets = Array.from(selectedMarkets).map(mid => ({
                market: mid.toUpperCase(),
                sub_market: null,
              }))

              let sourceAssetId = selectedFile?.assetId || searchParams.get('assetId') || null

              // Upload the file if not already an existing asset
              if (!sourceAssetId && selectedFile?.file && selectedProjectId) {
                // Check if it's a text file — use uploadText for .txt/.md/.csv
                const ext = selectedFile.name.toLowerCase().split('.').pop() ?? ''
                if (['txt', 'md', 'csv'].includes(ext)) {
                  const text = await selectedFile.file.text()
                  const asset = await uploadText({
                    project_id: selectedProjectId,
                    content: text,
                    filename: selectedFile.name,
                    format: ext as 'txt' | 'md' | 'csv',
                  })
                  sourceAssetId = asset.id
                } else {
                  const asset = await uploadAsset(selectedFile.file, selectedProjectId)
                  sourceAssetId = asset.id
                }
              }

              // Ingest from URL if we have a source URL
              const sourceUrl = searchParams.get('sourceUrl')
              if (!sourceAssetId && sourceUrl && selectedProjectId) {
                const asset = await ingestFromUrl({
                  url: sourceUrl,
                  project_id: selectedProjectId,
                  filename: selectedFile?.name,
                })
                sourceAssetId = asset.id
              }

              if (!sourceAssetId) {
                setSubmitError('No source asset available. Please upload a file or select an existing asset.')
                setSubmitting(false)
                return
              }

              // Wait a moment for parse to complete (it runs inline in dev mode)
              // The upload endpoint triggers parse inline, so asset should be ready

              const job = await createJob({
                source_asset_id: sourceAssetId,
                targets,
              })

              // Fire-and-forget: submit the job but don't wait for processing
              // In dev mode inline processing can take minutes (AI calls).
              // We redirect immediately and let the detail page poll for progress.
              submitJob(job.id).catch(() => { /* detail page will show status */ })

              router.push(`/localization/${job.id}`)
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to start job'
              setSubmitError(msg)
            } finally {
              setSubmitting(false)
            }
          }}
          className="w-full mt-6 py-4 rounded-xl text-center transition-all flex items-center justify-center gap-2"
          style={{
            fontFamily: SF_DISPLAY,
            fontSize: 16,
            fontWeight: 600,
            background: submitting ? 'var(--surface-3)' : 'var(--brand)',
            color: submitting ? 'var(--text-3)' : 'var(--brand-contrast)',
            border: 'none',
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Start Localization
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    )
  }

  /* ─── Render ─── */

  return (
    <div className="w-full" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="max-w-[800px] mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 style={{ fontFamily: SF_DISPLAY, fontSize: 36, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.5px' }}>
            New Localization Job
          </h1>
          <span style={{ fontFamily: SF_TEXT, fontSize: 14, color: 'var(--text-3)', fontWeight: 500 }}>
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>

        {StepIndicator()}

        {step === 1 && Step1()}
        {step === 2 && Step2()}
        {step === 3 && Step3()}
        {step === 4 && Step4()}
        {step === 5 && Step5()}

        {/* Navigation buttons */}
        {step < TOTAL_STEPS && (
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={step === 1 ? () => router.back() : goBack}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm transition-colors"
              style={{ fontFamily: SF_TEXT, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={goNext}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm transition-colors"
              style={{
                fontFamily: SF_TEXT,
                fontWeight: 600,
                background: canAdvance() ? 'var(--brand)' : 'var(--surface-2)',
                color: canAdvance() ? 'var(--brand-contrast)' : 'var(--text-3)',
                border: 'none',
                cursor: canAdvance() ? 'pointer' : 'not-allowed',
                opacity: canAdvance() ? 1 : 0.6,
              }}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === TOTAL_STEPS && (
          <div className="mt-4">
            <button
              onClick={goBack}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm transition-colors"
              style={{ fontFamily: SF_TEXT, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Strategy
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
