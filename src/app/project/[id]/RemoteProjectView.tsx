'use client'

/**
 * RemoteProjectView — read-only project detail view, sourced from
 * GET /api/projects/[id] (database) instead of the localStorage `lib/store`.
 *
 * Why this exists: the legacy ProjectWorkspace ('use client' page) reads
 * exclusively from localStorage. Projects auto-created server-side by
 * resolveProjectId() (when a report or landing page is generated) never
 * touch localStorage, so the workspace renders "Project not found" even
 * though the project + its artifacts exist in the database. This view is
 * the fallback rendered in that case — it lists the project's reports,
 * landing pages, and assets with direct view/preview affordances so the
 * generated content is always reachable.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, Layout, Image as ImageIcon, Clock,
  ChevronRight, AlertCircle, Loader2, Eye, ExternalLink,
} from 'lucide-react'

type ReportRow = {
  id: string
  kind: string
  status: string
  credits_charged: number | null
  created_at: string
}

type LandingRow = {
  id: string
  template_id: string | null
  status: string
  model: string | null
  html: string | null
  created_at: string
}

type AssetRow = {
  id: string
  type: string
  prompt: string | null
  url: string | null
  thumbnail: string | null
  created_at: string
}

type ProjectRow = {
  id: string
  name: string
  description: string | null
  status: string
  source: string | null
  created_at: string
  products: { id: string; name: string | null; url: string | null } | null
}

type ApiResponse =
  | { ok: true; project: ProjectRow; reports: ReportRow[]; landingPages: LandingRow[]; assets: AssetRow[] }
  | { ok: false; error: string }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function reportTitle(kind: string): string {
  if (kind === 'competitive-brief') return 'Competitive Brief'
  return `${kind[0].toUpperCase()}${kind.slice(1)} Report`
}

export default function RemoteProjectView({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<{ id: string; html: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: ApiResponse) => { if (!cancelled) setData(json) })
      .catch((err: Error) => { if (!cancelled) setNetworkError(err.message) })
    return () => { cancelled = true }
  }, [projectId])

  // Build a blob URL for the preview iframe (avoids parent-page CSP).
  const previewBlobUrl = useMemo(() => {
    if (!previewHtml) return null
    const blob = new Blob([previewHtml.html], { type: 'text/html' })
    return URL.createObjectURL(blob)
  }, [previewHtml])

  useEffect(() => {
    return () => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl) }
  }, [previewBlobUrl])

  const baseStyle = {
    fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  }

  if (networkError) {
    return (
      <div className="min-h-screen bg-white" style={baseStyle}>
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div
            style={{ backgroundColor: '#fff5f5', borderColor: '#fca5a5' }}
            className="rounded-lg p-4 border text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
            <div>
              <div className="font-medium text-red-700 mb-1">Failed to load project</div>
              <div className="text-red-600 text-xs">{networkError}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" style={baseStyle}>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading project…
        </div>
      </div>
    )
  }

  if (!data.ok) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" style={baseStyle}>
        <div className="text-center">
          <p style={{ color: 'rgba(0,0,0,0.48)' }} className="mb-4 text-sm">
            Project not found — it may have been deleted, or you don&apos;t have access.
          </p>
          <button
            onClick={() => router.push('/project')}
            style={{ color: '#0071e3' }}
            className="text-sm hover:opacity-75"
          >
            Back to Projects
          </button>
        </div>
      </div>
    )
  }

  const { project, reports, landingPages, assets } = data
  const totalArtifacts = reports.length + landingPages.length + assets.length

  return (
    <div className="min-h-screen bg-white" style={baseStyle}>
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <button
          onClick={() => router.push('/project')}
          className="flex items-center gap-1.5 text-sm mb-6"
          style={{ color: 'rgba(0,0,0,0.48)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          All projects
        </button>

        <div className="mb-10">
          <h1
            style={{ lineHeight: '1.07' }}
            className="text-4xl font-semibold tracking-tight text-black mb-2"
          >
            {project.name}
          </h1>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(0,0,0,0.48)' }}>
            <Clock className="w-3.5 h-3.5" />
            {timeAgo(project.created_at)}
            {project.products?.name && (
              <>
                <span style={{ color: 'rgba(0,0,0,0.2)' }}>·</span>
                <span>{project.products.name}</span>
              </>
            )}
            {project.source === 'auto' && (
              <span className="text-[10px] uppercase tracking-wide ml-2" style={{ color: 'rgba(0,0,0,0.32)' }}>
                auto
              </span>
            )}
          </div>
        </div>

        {totalArtifacts === 0 && (
          <div className="text-center py-16">
            <p style={{ color: 'rgba(0,0,0,0.48)' }} className="text-sm">
              This project is empty. Generate a report or landing page from Home to fill it.
            </p>
          </div>
        )}

        {/* Reports */}
        {reports.length > 0 && (
          <Section title="Reports" icon={<FileText className="w-4 h-4" />} count={reports.length}>
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/report/${r.id}`)}
                style={{ backgroundColor: '#f5f5f7' }}
                className="w-full text-left rounded-lg overflow-hidden hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    style={{ backgroundColor: '#e8f4ff' }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <FileText className="w-5 h-5" style={{ color: '#0071e3' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-black truncate">
                        {reportTitle(r.kind)}
                      </h3>
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color:
                            r.status === 'done' ? '#0071e3'
                            : r.status === 'failed' ? '#ef4444'
                            : r.status === 'running' ? '#f59e0b'
                            : 'rgba(0,0,0,0.4)',
                          backgroundColor: 'white',
                        }}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'rgba(0,0,0,0.48)' }}>
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo(r.created_at)}</span>
                      {r.credits_charged !== null && (
                        <>
                          <span style={{ color: 'rgba(0,0,0,0.2)' }}>·</span>
                          <span>{r.credits_charged} credit{r.credits_charged !== 1 ? 's' : ''}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'rgba(0,0,0,0.32)' }} />
                </div>
              </button>
            ))}
          </Section>
        )}

        {/* Landing pages */}
        {landingPages.length > 0 && (
          <Section title="Landing Pages" icon={<Layout className="w-4 h-4" />} count={landingPages.length}>
            {landingPages.map((lp) => (
              <div
                key={lp.id}
                style={{ backgroundColor: '#f5f5f7' }}
                className="w-full rounded-lg overflow-hidden"
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    style={{ backgroundColor: '#e8f4ff' }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <Layout className="w-5 h-5" style={{ color: '#0071e3' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-black truncate">
                        {lp.template_id || 'Landing Page'}
                      </h3>
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: lp.status === 'done' ? '#0071e3' : 'rgba(0,0,0,0.4)',
                          backgroundColor: 'white',
                        }}
                      >
                        {lp.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'rgba(0,0,0,0.48)' }}>
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo(lp.created_at)}</span>
                    </div>
                  </div>
                  {lp.html && (
                    <button
                      onClick={() => setPreviewHtml({ id: lp.id, html: lp.html as string })}
                      className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: '#0071e3', color: 'white' }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Assets */}
        {assets.length > 0 && (
          <Section title="Assets" icon={<ImageIcon className="w-4 h-4" />} count={assets.length}>
            {assets.map((a) => (
              <div
                key={a.id}
                style={{ backgroundColor: '#f5f5f7' }}
                className="w-full rounded-lg overflow-hidden"
              >
                <div className="flex items-center gap-4 p-4">
                  {a.thumbnail || a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbnail || a.url || ''}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      style={{ backgroundColor: '#e8f4ff' }}
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                    >
                      <ImageIcon className="w-5 h-5" style={{ color: '#0071e3' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-semibold text-black truncate">
                      {a.type || 'Asset'}
                    </h3>
                    <div className="text-xs mt-1 truncate" style={{ color: 'rgba(0,0,0,0.48)' }}>
                      {a.prompt || timeAgo(a.created_at)}
                    </div>
                  </div>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: 'white', color: '#0071e3', border: '1px solid #e2e8f0' }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </a>
                  )}
                </div>
              </div>
            ))}
          </Section>
        )}
      </div>

      {/* Landing-page preview modal */}
      {previewHtml && previewBlobUrl && (
        <div
          onClick={() => setPreviewHtml(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl overflow-hidden flex flex-col"
            style={{ width: '90vw', maxWidth: 1100, height: '85vh' }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div className="text-sm font-medium text-black">Landing Page Preview</div>
              <button
                onClick={() => setPreviewHtml(null)}
                className="text-sm text-gray-500 hover:text-black"
              >
                Close
              </button>
            </div>
            <iframe
              src={previewBlobUrl}
              className="flex-1 w-full"
              sandbox="allow-same-origin allow-scripts"
              title="Landing page preview"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Section({
  title, icon, count, children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <div style={{ color: 'rgba(0,0,0,0.6)' }}>{icon}</div>
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'rgba(0,0,0,0.6)' }}>
          {title}
        </h2>
        <span className="text-xs" style={{ color: 'rgba(0,0,0,0.32)' }}>{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
