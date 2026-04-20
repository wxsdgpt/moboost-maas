/**
 * /specs/inspector — interactive Spec Validator playground
 * ===========================================================================
 * Tiny single-file page that lets xu poke at the spec validator without
 * writing curl. Two modes:
 *
 *   1. Validate    — pick one or more specs by id, see per-spec reports
 *   2. Best-Fit    — describe a hypothetical asset, see which specs in
 *                    the catalog natively fit (and which are near-misses)
 *
 * Pure client + a single fetch to /api/spec/validate. No router state,
 * no SSR — this is a developer/qa surface, not a production page.
 */
'use client'

import { useState } from 'react'

interface Violation {
  code: string
  severity: 'blocker' | 'warning' | 'info'
  field: string
  message: string
  expected: string
  actual: string
  fix?: string
}

interface ValidationReport {
  specId: string
  specName: string
  specNameZh: string
  ok: boolean
  score: number
  blockers: number
  warnings: number
  infos: number
  violations: Violation[]
  summary: string
}

const PRESETS = [
  {
    label: 'IG Reel @ 1080×1920 30s mp4 50MB',
    asset: { width: 1080, height: 1920, mediaType: 'video', durationSec: 30, fps: 30, format: 'mp4', fileSizeMB: 50 },
  },
  {
    label: 'Square 1080×1080 jpg',
    asset: { width: 1080, height: 1080, mediaType: 'image', format: 'jpg', fileSizeMB: 1 },
  },
  {
    label: 'Landscape 1920×1080 webp',
    asset: { width: 1920, height: 1080, mediaType: 'image', format: 'webp', fileSizeMB: 1 },
  },
  {
    label: 'IAB MPU 300×250 jpg',
    asset: { width: 300, height: 250, mediaType: 'image', format: 'jpg', fileSizeMB: 0.1 },
  },
  {
    label: 'TikTok 60s 4K (will trigger crop suggestion)',
    asset: { width: 3840, height: 2160, mediaType: 'video', durationSec: 60, fps: 30, format: 'mp4', fileSizeMB: 200 },
  },
] as const

function severityClass(sev: string): string {
  if (sev === 'blocker') return 'text-rose-300 bg-rose-900/40 border-rose-700'
  if (sev === 'warning') return 'text-amber-300 bg-amber-900/40 border-amber-700'
  return 'text-[#2997ff] bg-blue-900/40 border-blue-700'
}

function scoreColor(score: number, ok: boolean): string {
  if (!ok) return 'text-rose-400'
  if (score >= 95) return 'text-[var(--brand)]'
  if (score >= 80) return 'text-lime-400'
  return 'text-amber-300'
}

export default function SpecsInspectorPage() {
  const [width, setWidth] = useState(1080)
  const [height, setHeight] = useState(1920)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('video')
  const [durationSec, setDurationSec] = useState<number | ''>(30)
  const [fps, setFps] = useState<number | ''>(30)
  const [format, setFormat] = useState('mp4')
  const [fileSizeMB, setFileSizeMB] = useState<number | ''>(50)
  const [pool, setPool] = useState<'all' | 'core' | 'igaming'>('core')
  const [tolerance, setTolerance] = useState<'strict' | 'standard' | 'lenient'>('standard')
  const [reports, setReports] = useState<ValidationReport[]>([])
  const [nearMisses, setNearMisses] = useState<ValidationReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [probeInfo, setProbeInfo] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)

  function applyPreset(p: (typeof PRESETS)[number]) {
    setWidth(p.asset.width)
    setHeight(p.asset.height)
    setMediaType(p.asset.mediaType as 'image' | 'video')
    setDurationSec((p.asset as { durationSec?: number }).durationSec ?? '')
    setFps((p.asset as { fps?: number }).fps ?? '')
    setFormat(p.asset.format)
    setFileSizeMB(p.asset.fileSizeMB ?? '')
    setProbeInfo(null)
  }

  async function probeRealFile(file: File) {
    setProbing(true)
    setProbeInfo(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/spec/probe', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `http ${res.status}`)
      const p = data.probe as {
        mediaType: 'image' | 'video' | 'unknown'
        mime: string
        fileSizeMB: number
        width?: number
        height?: number
        durationSec?: number
        fps?: number
        codec?: string
        brand?: string
        hasVideoTrack?: boolean
      }
      if (p.mediaType === 'image' || p.mediaType === 'video') {
        setMediaType(p.mediaType)
      }
      if (p.width !== undefined) setWidth(p.width)
      if (p.height !== undefined) setHeight(p.height)
      if (p.fileSizeMB !== undefined) setFileSizeMB(p.fileSizeMB)
      // Derive a sensible `format` string from the mime type
      const fmt = p.mime.split('/')[1] || ''
      if (fmt) setFormat(fmt.replace(/^x-/, ''))
      if (p.mediaType === 'video') {
        if (p.durationSec !== undefined) setDurationSec(p.durationSec)
        else setDurationSec('')
        if (p.fps !== undefined) setFps(p.fps)
        else setFps('')
      } else {
        setDurationSec('')
        setFps('')
      }
      const bits: string[] = [`mime=${p.mime}`, `${p.fileSizeMB}MB`]
      if (p.brand) bits.push(`brand=${p.brand.trim()}`)
      if (p.codec) bits.push(`codec=${p.codec.trim()}`)
      if (p.mediaType === 'video' && !p.hasVideoTrack) bits.push('(audio-only or unrecognized)')
      setProbeInfo(`✓ ${file.name} → ${bits.join(' · ')}`)
    } catch (e) {
      setProbeInfo(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setProbing(false)
    }
  }

  async function runBestFit() {
    setLoading(true)
    setError(null)
    try {
      const asset: Record<string, unknown> = {
        width,
        height,
        mediaType,
        format,
      }
      if (mediaType === 'video' && durationSec !== '') asset.durationSec = durationSec
      if (mediaType === 'video' && fps !== '') asset.fps = fps
      if (fileSizeMB !== '') asset.fileSizeMB = fileSizeMB

      const res = await fetch('/api/spec/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'best-fit',
          asset,
          pool,
          options: { tolerance, checkSafeZone: true },
          fitLimit: 12,
          nearMissLimit: 8,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `http ${res.status}`)
      setReports(data.bestFits as ValidationReport[])
      setNearMisses(data.nearMisses as ValidationReport[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setReports([])
      setNearMisses([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen text-white px-6 py-8" style={{ background: 'var(--bg)', fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-white">Spec Validator · Inspector</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Interactive debug tool — enter an asset's width / height / duration / format / size
            and instantly see which catalog specs are a perfect match, which are salvageable, and which are unusable.
            Powered entirely by <code className="bg-[var(--surface-3)] px-1 rounded text-white">/api/spec/validate</code>.
          </p>
        </header>

        {/* Presets */}
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="text-xs rounded-full px-3 py-1 border border-[var(--border)] hover:border-[var(--brand)] bg-[var(--surface-3)] text-white hover:bg-[var(--border)]"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Probe a real file (image or video) */}
        <div className="mb-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-3)] p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-white">
            Or drop in a real file (png/jpg/webp/mp4/mov) — imageProbe / videoProbe will auto-fill the fields above:
          </span>
          <label className="text-xs rounded-md bg-[var(--brand)] hover:bg-[var(--brand)] px-3 py-1 cursor-pointer text-[var(--brand-contrast)]">
            {probing ? 'Probing…' : 'Choose file'}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) probeRealFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {probeInfo && (
            <span
              className={`text-[11px] ${
                probeInfo.startsWith('✓') ? 'text-[var(--brand)]' : 'text-rose-300'
              }`}
            >
              {probeInfo}
            </span>
          )}
        </div>

        {/* Inputs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[var(--surface-3)] border border-[var(--border)] rounded-lg p-4">
          <Field label="Width (px)">
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value || '0', 10))}
              className="input"
            />
          </Field>
          <Field label="Height (px)">
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value || '0', 10))}
              className="input"
            />
          </Field>
          <Field label="Media type">
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as 'image' | 'video')}
              className="input"
            >
              <option value="image">image</option>
              <option value="video">video</option>
            </select>
          </Field>
          <Field label="Format (mp4 / jpg / webp …)">
            <input value={format} onChange={(e) => setFormat(e.target.value)} className="input" />
          </Field>

          <Field label="Duration (sec, video only)">
            <input
              type="number"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value === '' ? '' : parseFloat(e.target.value))}
              disabled={mediaType !== 'video'}
              className="input"
            />
          </Field>
          <Field label="Frame rate (fps)">
            <input
              type="number"
              value={fps}
              onChange={(e) => setFps(e.target.value === '' ? '' : parseFloat(e.target.value))}
              disabled={mediaType !== 'video'}
              className="input"
            />
          </Field>
          <Field label="Size (MB)">
            <input
              type="number"
              step="0.1"
              value={fileSizeMB}
              onChange={(e) => setFileSizeMB(e.target.value === '' ? '' : parseFloat(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Pool / Tolerance">
            <div className="flex gap-2">
              <select value={pool} onChange={(e) => setPool(e.target.value as typeof pool)} className="input flex-1">
                <option value="core">core</option>
                <option value="igaming">igaming</option>
                <option value="all">all</option>
              </select>
              <select
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value as typeof tolerance)}
                className="input flex-1"
              >
                <option value="strict">strict</option>
                <option value="standard">standard</option>
                <option value="lenient">lenient</option>
              </select>
            </div>
          </Field>
        </section>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={runBestFit}
            disabled={loading}
            className="rounded-lg bg-[var(--brand)] hover:bg-[var(--brand)] disabled:opacity-50 px-5 py-2 text-sm font-medium text-[var(--brand-contrast)]"
          >
            {loading ? 'Validating…' : 'Find best match →'}
          </button>
          {error && <span className="text-xs text-rose-400">{error}</span>}
        </div>

        {/* Results — best fits */}
        {reports.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm uppercase tracking-wide text-[var(--text-3)] mb-3">
              ✓ Perfect matches ({reports.length})
            </h2>
            <div className="space-y-3">
              {reports.map((r) => (
                <ReportCard key={r.specId} report={r} />
              ))}
            </div>
          </section>
        )}

        {nearMisses.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm uppercase tracking-wide text-[var(--text-3)] mb-3">
              △ Near misses ({nearMisses.length}) — usable after applying the fix suggestions
            </h2>
            <div className="space-y-3">
              {nearMisses.map((r) => (
                <ReportCard key={r.specId} report={r} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* tiny inline styles for inputs (avoid bringing in a form lib) */}
      <style jsx>{`
        .input {
          background: var(--surface-3);
          border: 1px solid var(--border);
          padding: 6px 8px;
          border-radius: 6px;
          color: var(--text-1);
          font-size: 12px;
          width: 100%;
        }
        .input:focus {
          outline: none;
          border-color: var(--brand);
          box-shadow: 0 0 0 3px var(--brand-light);
        }
      `}</style>
    </main>
  )

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <label className="text-xs text-white space-y-1 block">
        <div>{label}</div>
        {children}
      </label>
    )
  }

  function ReportCard({ report }: { report: ValidationReport }) {
    return (
      <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-3)] p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-medium text-white">{report.specNameZh}</div>
            <div className="text-[11px] text-[var(--text-3)]">
              {report.specId} · {report.specName}
            </div>
          </div>
          <div className={`text-2xl font-mono ${scoreColor(report.score, report.ok)}`}>
            {report.score}
          </div>
        </div>
        <div className="text-xs text-white mb-2">{report.summary}</div>
        {report.violations.length > 0 && (
          <ul className="space-y-1.5">
            {report.violations.map((v, i) => (
              <li
                key={i}
                className={`text-[11px] rounded border px-2 py-1.5 ${severityClass(v.severity)}`}
              >
                <div className="font-medium">
                  [{v.severity}] {v.field}: {v.message}
                </div>
                <div className="opacity-80">
                  expected: {v.expected} · actual: {v.actual}
                </div>
                {v.fix && <div className="mt-0.5">fix → {v.fix}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
}
