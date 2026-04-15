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
    label: '方图 1080×1080 jpg',
    asset: { width: 1080, height: 1080, mediaType: 'image', format: 'jpg', fileSizeMB: 1 },
  },
  {
    label: '横图 1920×1080 webp',
    asset: { width: 1920, height: 1080, mediaType: 'image', format: 'webp', fileSizeMB: 1 },
  },
  {
    label: 'IAB MPU 300×250 jpg',
    asset: { width: 300, height: 250, mediaType: 'image', format: 'jpg', fileSizeMB: 0.1 },
  },
  {
    label: 'TikTok 60s 4K (会被裁剪建议)',
    asset: { width: 3840, height: 2160, mediaType: 'video', durationSec: 60, fps: 30, format: 'mp4', fileSizeMB: 200 },
  },
] as const

function severityClass(sev: string): string {
  if (sev === 'blocker') return 'text-rose-300 bg-rose-900/40 border-rose-700'
  if (sev === 'warning') return 'text-amber-300 bg-amber-900/40 border-amber-700'
  return 'text-sky-300 bg-sky-900/40 border-sky-700'
}

function scoreColor(score: number, ok: boolean): string {
  if (!ok) return 'text-rose-400'
  if (score >= 95) return 'text-emerald-400'
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
      if (p.mediaType === 'video' && !p.hasVideoTrack) bits.push('（音频或未识别）')
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
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Spec Validator · Inspector</h1>
          <p className="text-sm text-neutral-400 mt-1">
            交互式调试页面 — 输入素材的 width / height / 时长 / 格式 / 体积，
            实时看 catalog 里哪些规格可以原样复用、哪些近似可救、哪些彻底不行。
            完全跑在 <code className="bg-neutral-800 px-1 rounded">/api/spec/validate</code> 上。
          </p>
        </header>

        {/* Presets */}
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="text-xs rounded-full px-3 py-1 border border-neutral-700 hover:border-neutral-400 bg-neutral-900"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Probe a real file (image or video) */}
        <div className="mb-4 rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-neutral-300">
            或者直接丢一个真实文件 (png/jpg/webp/mp4/mov) — 自动用 imageProbe / videoProbe 填充上面的字段：
          </span>
          <label className="text-xs rounded-md bg-sky-700 hover:bg-sky-600 px-3 py-1 cursor-pointer">
            {probing ? '正在解析…' : '选择文件'}
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
                probeInfo.startsWith('✓') ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {probeInfo}
            </span>
          )}
        </div>

        {/* Inputs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
          <Field label="宽度 (px)">
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value || '0', 10))}
              className="input"
            />
          </Field>
          <Field label="高度 (px)">
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value || '0', 10))}
              className="input"
            />
          </Field>
          <Field label="媒体类型">
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as 'image' | 'video')}
              className="input"
            >
              <option value="image">image</option>
              <option value="video">video</option>
            </select>
          </Field>
          <Field label="格式 (mp4 / jpg / webp …)">
            <input value={format} onChange={(e) => setFormat(e.target.value)} className="input" />
          </Field>

          <Field label="时长 (秒, 仅视频)">
            <input
              type="number"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value === '' ? '' : parseFloat(e.target.value))}
              disabled={mediaType !== 'video'}
              className="input"
            />
          </Field>
          <Field label="帧率 fps">
            <input
              type="number"
              value={fps}
              onChange={(e) => setFps(e.target.value === '' ? '' : parseFloat(e.target.value))}
              disabled={mediaType !== 'video'}
              className="input"
            />
          </Field>
          <Field label="体积 (MB)">
            <input
              type="number"
              step="0.1"
              value={fileSizeMB}
              onChange={(e) => setFileSizeMB(e.target.value === '' ? '' : parseFloat(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="池 / 容差">
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
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2 text-sm font-medium"
          >
            {loading ? '校验中…' : '查找最佳匹配 →'}
          </button>
          {error && <span className="text-xs text-rose-400">{error}</span>}
        </div>

        {/* Results — best fits */}
        {reports.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm uppercase tracking-wide text-neutral-400 mb-3">
              ✓ 完美匹配（{reports.length}）
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
            <h2 className="text-sm uppercase tracking-wide text-neutral-400 mb-3">
              △ 近似可救（{nearMisses.length}）— 跟着 fix 建议处理就能用
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
          background: #0a0a0a;
          border: 1px solid #2a2a2a;
          padding: 6px 8px;
          border-radius: 6px;
          color: #e5e5e5;
          font-size: 12px;
          width: 100%;
        }
        .input:focus {
          outline: none;
          border-color: #38bdf8;
        }
      `}</style>
    </main>
  )

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <label className="text-xs text-neutral-300 space-y-1 block">
        <div>{label}</div>
        {children}
      </label>
    )
  }

  function ReportCard({ report }: { report: ValidationReport }) {
    return (
      <div className="border border-neutral-800 rounded-lg bg-neutral-900/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-medium">{report.specNameZh}</div>
            <div className="text-[11px] text-neutral-500">
              {report.specId} · {report.specName}
            </div>
          </div>
          <div className={`text-2xl font-mono ${scoreColor(report.score, report.ok)}`}>
            {report.score}
          </div>
        </div>
        <div className="text-xs text-neutral-300 mb-2">{report.summary}</div>
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
