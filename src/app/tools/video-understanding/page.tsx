'use client'

import { useState, useRef, useCallback } from 'react'
import { ArrowLeft, Upload, Play, Film, ImageIcon, FileText, Clock, Coins, Hash, X, AlertCircle } from 'lucide-react'
import Link from 'next/link'

type TabKey = 'global' | 'keyframes' | 'per-frame'

export default function VideoUnderstandingPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('global')
  const [analyzing, setAnalyzing] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const acceptedTypes = ['video/mp4', 'video/quicktime', 'video/webm']

  const handleFile = useCallback((file: File) => {
    if (!acceptedTypes.includes(file.type)) return
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setShowNotice(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const removeVideo = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoFile(null)
    setVideoUrl(null)
    setShowNotice(false)
  }, [videoUrl])

  const handleAnalyze = () => {
    setAnalyzing(true)
    setTimeout(() => {
      setAnalyzing(false)
      setShowNotice(true)
    }, 1200)
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'global', label: 'Global Understanding', icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'keyframes', label: 'Keyframe Gallery', icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { key: 'per-frame', label: 'Per-Frame Analysis', icon: <Film className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="p-8" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-4 transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-3)' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Tools
        </Link>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand-light)' }}>
            <Film className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>Video Understanding</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              AI-powered video analysis — extract timelines, keyframes, OCR text, and semantic clips
            </p>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      {!videoFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer transition-all"
          style={{
            backgroundColor: isDragging ? 'var(--surface-3)' : 'var(--surface-1)',
            border: `2px dashed ${isDragging ? 'var(--brand)' : 'var(--border-strong)'}`,
            minHeight: 280,
          }}
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--brand-light)' }}>
            <Upload className="w-6 h-6" style={{ color: 'var(--brand)' }} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>
            Drop video here or click to upload
          </p>
          <p className="text-xs" style={{ color: 'var(--text-4)' }}>
            Supports MP4, MOV, WebM
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Video Preview */}
          <div className="rounded-lg overflow-hidden relative" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{videoFile.name}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-4)' }}>
                  {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
              <button
                onClick={removeVideo}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:opacity-70"
                style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-3)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-center p-4" style={{ backgroundColor: '#000' }}>
              <video
                src={videoUrl!}
                controls
                className="rounded"
                style={{ maxHeight: 400, maxWidth: '100%' }}
              />
            </div>
          </div>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast)' }}
          >
            {analyzing ? (
              <>
                <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-contrast)', borderTopColor: 'transparent' }} />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Analysis
              </>
            )}
          </button>

          {/* "Feature in development" Notice */}
          {showNotice && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg"
              style={{ backgroundColor: 'var(--brand-light)', border: '1px solid var(--brand)' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>
                Feature in development — video analysis pipeline will be available in a future release.
              </span>
            </div>
          )}

          {/* Results Area */}
          <div className="rounded-lg" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            {/* Tabs */}
            <div className="flex gap-0" style={{ borderBottom: '1px solid var(--border)' }}>
              {tabs.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="flex items-center gap-2 px-5 py-3 text-xs font-medium transition-all relative"
                  style={{
                    color: activeTab === key ? 'var(--brand)' : 'var(--text-4)',
                  }}
                >
                  {icon}
                  {label}
                  {activeTab === key && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: 'var(--brand)' }} />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6" style={{ minHeight: 300 }}>
              {activeTab === 'global' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Global Understanding</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                    AI will generate a comprehensive summary of the video content including scene descriptions,
                    detected actions, on-screen text (OCR), speaker identification, and a structured operation timeline.
                  </p>
                  <div className="rounded-md p-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-xs italic" style={{ color: 'var(--text-4)' }}>
                      Analysis results will appear here after processing...
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'keyframes' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Keyframe Gallery</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                    Automatically extracted keyframes representing significant visual changes, scene transitions,
                    and important moments in the video.
                  </p>
                  {/* Placeholder grid */}
                  <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-video rounded-md flex items-center justify-center"
                        style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      >
                        <ImageIcon className="w-5 h-5" style={{ color: 'var(--text-5)' }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'per-frame' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Per-Frame Analysis</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                    Detailed frame-by-frame analysis with timestamps, detected objects, OCR text extraction,
                    and semantic annotations for each key segment.
                  </p>
                  <div className="rounded-md p-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-xs italic" style={{ color: 'var(--text-4)' }}>
                      Per-frame analysis results will appear here after processing...
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center gap-6 px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-4)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>Duration: —</span>
            </div>
            <div className="flex items-center gap-2">
              <Coins className="w-3.5 h-3.5" style={{ color: 'var(--text-4)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>Cost: —</span>
            </div>
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5" style={{ color: 'var(--text-4)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>Tokens: —</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
