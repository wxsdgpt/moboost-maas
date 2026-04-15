'use client'

/**
 * /project — list of all projects for the current user.
 *
 * Source of truth is the database via GET /api/projects (returns rows
 * enriched with `counts: { reports, landingPages, assets }` and the
 * embedded `products` row). The page used to read from a localStorage
 * `lib/store`, which silently diverged whenever artifacts were generated
 * server-side — that's why generated reports/landing pages "disappeared"
 * after creation. This file is now a thin renderer over the API.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderKanban, FileText, Image as ImageIcon, Layout,
  Clock, ChevronRight, AlertCircle, Loader2,
} from 'lucide-react'

type ProjectRow = {
  id: string
  name: string
  description: string | null
  status: string
  source: string | null
  created_at: string
  updated_at: string | null
  product_id: string | null
  products: {
    id: string
    name: string | null
    url: string | null
    category: string | null
    enrichment_status: string | null
  } | null
  counts: { reports: number; landingPages: number; assets: number }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ProjectPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/projects', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (!data.ok) {
          setError(data.error || 'failed_to_load')
          setProjects([])
          return
        }
        setProjects(data.projects ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = projects === null
  const total = projects?.length ?? 0

  return (
    <div
      style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
      className="min-h-screen bg-white"
    >
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1
            style={{ lineHeight: '1.07' }}
            className="text-5xl font-semibold tracking-tight text-black mb-2"
          >
            Projects
          </h1>
          <p style={{ color: 'rgba(0,0,0,0.48)' }} className="text-base">
            {loading ? 'Loading…' : `${total} project${total !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{ backgroundColor: '#fff5f5', borderColor: '#fca5a5' }}
            className="rounded-lg p-4 mb-8 border max-w-2xl text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
            <div>
              <div className="font-medium text-red-700 mb-1">Failed to load projects</div>
              <div className="text-red-600 text-xs">{error}</div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-12">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading projects…
          </div>
        )}

        {/* Empty state */}
        {!loading && total === 0 && !error && (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
              <FolderKanban className="w-10 h-10" style={{ color: 'rgba(0,0,0,0.2)' }} />
            </div>
            <h2 style={{ lineHeight: '1.1' }} className="text-2xl font-semibold text-black mb-3">
              No projects yet
            </h2>
            <p style={{ color: 'rgba(0,0,0,0.48)' }} className="text-base">
              Generate a report or landing page from Home to create your first project.
            </p>
          </div>
        )}

        {/* Project list */}
        <div className="space-y-3">
          {(projects ?? []).map((proj) => {
            const totalArtifacts =
              proj.counts.reports + proj.counts.landingPages + proj.counts.assets
            return (
              <button
                key={proj.id}
                onClick={() => router.push(`/project/${proj.id}`)}
                style={{ backgroundColor: '#f5f5f7' }}
                className="w-full text-left rounded-lg overflow-hidden hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    style={{ backgroundColor: '#e8f4ff' }}
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <FolderKanban className="w-6 h-6" style={{ color: '#0071e3' }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3
                        style={{ lineHeight: '1.1' }}
                        className="text-base font-semibold text-black truncate"
                      >
                        {proj.name}
                      </h3>
                      {proj.source === 'auto' && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">
                          auto
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Clock className="w-3 h-3" style={{ color: 'rgba(0,0,0,0.48)' }} />
                      <span style={{ color: 'rgba(0,0,0,0.48)' }} className="text-xs">
                        {timeAgo(proj.created_at)}
                      </span>
                      {proj.products?.name && (
                        <>
                          <span style={{ color: 'rgba(0,0,0,0.2)' }}>·</span>
                          <span style={{ color: 'rgba(0,0,0,0.48)' }} className="text-xs truncate">
                            {proj.products.name}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Counts row */}
                    <div className="flex items-center gap-3 mt-2">
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: 'rgba(0,0,0,0.6)' }}
                      >
                        <FileText className="w-3 h-3" />
                        {proj.counts.reports} report{proj.counts.reports !== 1 ? 's' : ''}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: 'rgba(0,0,0,0.6)' }}
                      >
                        <Layout className="w-3 h-3" />
                        {proj.counts.landingPages} landing
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: 'rgba(0,0,0,0.6)' }}
                      >
                        <ImageIcon className="w-3 h-3" />
                        {proj.counts.assets} asset{proj.counts.assets !== 1 ? 's' : ''}
                      </span>
                      {totalArtifacts === 0 && (
                        <span className="text-[11px] text-gray-400 italic">
                          empty — generate something to fill it
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    style={{ backgroundColor: '#0071e3', color: 'white' }}
                    className="px-4 py-2 rounded-full text-sm font-medium flex-shrink-0"
                  >
                    Open
                  </span>
                  <ChevronRight
                    className="w-5 h-5 flex-shrink-0"
                    style={{ color: 'rgba(0,0,0,0.32)' }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
