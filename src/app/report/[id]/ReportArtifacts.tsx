'use client'

/**
 * ReportArtifacts — surfaces every landing page and image/video creative
 * generated for a single report, in reverse-chronological order. Re-runs
 * stack instead of replacing, so users can compare versions.
 *
 * Each row supports a per-row regenerate flow: open the row, type a custom
 * prompt, hit Regenerate. Calls the regenerate-creative or regenerate-landing
 * endpoint (which inserts a new row, preserving history).
 *
 * Lives under the brief on the report-detail page; rendered only when the
 * report is unlocked / paid (parent ReportView controls visibility) since
 * the user has already paid for downstream artifacts.
 */

import { useEffect, useState, useCallback } from 'react'
import { Image as ImageIcon, Film, Globe, RefreshCw, ExternalLink } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleProvider'

type Creative = {
  id: string
  type: 'image' | 'video'
  prompt: string | null
  url: string
  thumbnail: string | null
  model: string | null
  audience_tag: string | null
  region: string | null
  created_at: string
}

type LandingPage = {
  id: string
  template_id: string | null
  status: string | null
  model: string | null
  html: string | null
  filled_slots: unknown
  created_at: string
}

type ApiResponse = {
  ok: boolean
  reportId?: string
  projectId?: string | null
  productId?: string | null
  landingPages?: LandingPage[]
  creatives?: Creative[]
  error?: string
}

type Tab = 'landings' | 'creatives'

const C = {
  black: '#000',
  nearBlack: '#1d1d1f',
  lightGray: '#f5f5f7',
  blue: '#0071e3',
  linkBlue: '#0066cc',
  white: '#fff',
  text48: 'rgba(0,0,0,0.48)',
  border: 'rgba(0,0,0,0.08)',
}

export default function ReportArtifacts({ reportId }: { reportId: string }) {
  const { t } = useLocale()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('landings')
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/${reportId}/artifacts`, { cache: 'no-store' })
      const json = (await res.json()) as ApiResponse
      if (!json.ok) throw new Error(json.error || 'fetch_failed')
      setData(json)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => { refetch() }, [refetch])

  const landings = data?.landingPages ?? []
  const creatives = data?.creatives ?? []

  return (
    <section style={{ background: C.white, padding: '60px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
        <h2 style={{
          fontSize: 40, fontWeight: 600, lineHeight: 1.10,
          color: C.nearBlack, marginBottom: 8, textAlign: 'center',
        }}>
          {t('artifacts.title')}
        </h2>
        <p style={{
          fontSize: 17, color: C.text48, textAlign: 'center', marginBottom: 32,
          letterSpacing: -0.374,
        }}>
          {t('artifacts.subtitle')}
        </p>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 24,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <TabButton active={tab === 'landings'} onClick={() => setTab('landings')} icon={<Globe size={14} />}>
            {t('artifacts.tab.landings')} ({landings.length})
          </TabButton>
          <TabButton active={tab === 'creatives'} onClick={() => setTab('creatives')} icon={<ImageIcon size={14} />}>
            {t('artifacts.tab.creatives')} ({creatives.length})
          </TabButton>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: C.text48 }}>{t('artifacts.loading')}</div>}
        {error && <div style={{ textAlign: 'center', padding: 40, color: '#ff453a' }}>{t('common.error')}: {error}</div>}

        {!loading && !error && tab === 'landings' && (
          landings.length === 0
            ? <EmptyState label={t('artifacts.empty.landings')} />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {landings.map((l) => (
                  <LandingRow key={l.id} landing={l} reportId={reportId} onRegenerated={refetch} />
                ))}
              </div>
            )
        )}

        {!loading && !error && tab === 'creatives' && (
          creatives.length === 0
            ? <EmptyState label={t('artifacts.empty.creatives')} />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {creatives.map((c) => (
                  <CreativeCard key={c.id} creative={c} reportId={reportId} onRegenerated={refetch} />
                ))}
              </div>
            )
        )}
      </div>
    </section>
  )
}

/* ─────────── Tab + Empty ─────────── */

function TabButton({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 20px', border: 'none', background: 'none',
        cursor: 'pointer',
        fontSize: 14, fontWeight: active ? 600 : 400,
        color: active ? C.nearBlack : C.text48,
        borderBottom: active ? `2px solid ${C.blue}` : '2px solid transparent',
        marginBottom: -1,
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 24px',
      background: C.lightGray, borderRadius: 8, color: C.text48,
      fontSize: 14,
    }}>
      {label}
    </div>
  )
}

/* ─────────── Landing row ─────────── */

function LandingRow({ landing, reportId, onRegenerated }: {
  landing: LandingPage; reportId: string; onRegenerated: () => void;
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!landing.html) return
    const blob = new Blob([landing.html], { type: 'text/html' })
    const u = URL.createObjectURL(blob)
    setPreviewUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [landing.html])

  const regenerate = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/brief/regenerate-landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, customPrompt: prompt || null, templateId: landing.template_id }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'regen_failed')
      setPrompt('')
      setOpen(false)
      onRegenerated()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: C.lightGray }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.nearBlack }}>
          <Globe size={14} color={C.linkBlue} />
          <strong>{landing.template_id || 'landing'}</strong>
          <span style={{ color: C.text48 }}>· {new Date(landing.created_at).toLocaleString()}</span>
          {landing.model && <span style={{ color: C.text48, fontSize: 11 }}>· {landing.model}</span>}
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: 'none', border: `1px solid ${C.linkBlue}`,
            color: C.linkBlue, borderRadius: 980, padding: '4px 12px',
            fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <RefreshCw size={12} />
          {open ? t('common.cancel') : t('common.regenerate')}
        </button>
      </div>

      {previewUrl && (
        <iframe
          src={previewUrl}
          title={`landing-${landing.id}`}
          style={{ width: '100%', height: 320, border: 'none', display: 'block', background: '#fff' }}
          sandbox="allow-same-origin"
        />
      )}

      {open && (
        <div style={{ padding: 16, background: C.white, borderTop: `1px solid ${C.border}` }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('artifacts.regenerate.landingPlaceholder')}
            rows={3}
            style={{
              width: '100%', padding: 12, fontSize: 14, fontFamily: 'inherit',
              border: `1px solid ${C.border}`, borderRadius: 6, resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          {err && <div style={{ color: '#ff453a', fontSize: 12, marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={regenerate}
              disabled={busy}
              style={{
                background: busy ? '#999' : C.blue, color: C.white, border: 'none',
                borderRadius: 8, padding: '8px 18px', fontSize: 14,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? t('artifacts.generating') : t('artifacts.regenerate.button.landing')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────── Creative card (image/video) ─────────── */

function CreativeCard({ creative, reportId, onRegenerated }: {
  creative: Creative; reportId: string; onRegenerated: () => void;
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState(creative.prompt || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const regenerate = async () => {
    if (!prompt.trim()) {
      setErr(t('artifacts.promptRequired'))
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/brief/regenerate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          type: creative.type,
          prompt,
          audienceTag: creative.audience_tag,
          region: creative.region,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'regen_failed')
      setOpen(false)
      onRegenerated()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: C.white }}>
      <div style={{ aspectRatio: '16 / 9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {creative.type === 'image'
          ? <img src={creative.url} alt={creative.prompt || 'creative'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <video src={creative.url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        }
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.text48, marginBottom: 6 }}>
          {creative.type === 'image' ? <ImageIcon size={11} /> : <Film size={11} />}
          <span style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{creative.type}</span>
          {creative.audience_tag && <span>· {creative.audience_tag}</span>}
          {creative.region && <span>· {creative.region}</span>}
          <span style={{ marginLeft: 'auto' }}>{new Date(creative.created_at).toLocaleDateString()}</span>
        </div>
        {creative.prompt && (
          <p style={{
            fontSize: 12, color: C.nearBlack, lineHeight: 1.4, margin: '0 0 8px',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {creative.prompt}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <a
            href={creative.url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: C.linkBlue, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {t('common.open')} <ExternalLink size={10} />
          </a>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              background: 'none', border: `1px solid ${C.linkBlue}`,
              color: C.linkBlue, borderRadius: 980, padding: '3px 10px',
              fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={10} />
            {open ? t('common.cancel') : t('common.regenerate')}
          </button>
        </div>

        {open && (
          <div style={{ marginTop: 10 }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={creative.type === 'image' ? t('artifacts.regenerate.imagePlaceholder') : t('artifacts.regenerate.videoPlaceholder')}
              rows={3}
              style={{
                width: '100%', padding: 8, fontSize: 12, fontFamily: 'inherit',
                border: `1px solid ${C.border}`, borderRadius: 4, resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            {err && <div style={{ color: '#ff453a', fontSize: 11, marginTop: 4 }}>{err}</div>}
            <button
              onClick={regenerate}
              disabled={busy}
              style={{
                marginTop: 8, width: '100%',
                background: busy ? '#999' : C.blue, color: C.white, border: 'none',
                borderRadius: 6, padding: '6px 12px', fontSize: 12,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? t('artifacts.generating') : (creative.type === 'image' ? t('artifacts.regenerate.button.image') : t('artifacts.regenerate.button.video'))}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
