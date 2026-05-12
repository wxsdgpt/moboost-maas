'use client'

/**
 * /project — list of all projects for the current user.
 *
 * Merged data source: reads from both the database (GET /api/projects) and
 * the client-side store (localStorage). DB projects come with server-generated
 * artifacts (reports, landing pages). Store projects come from the asset
 * generation flow (UnifiedCollector → ProjectWorkspace). Both are merged
 * and deduplicated by ID so the user sees everything in one list.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderKanban, FileText, Image as ImageIcon, Layout,
  Clock, ChevronRight, AlertCircle, Loader2,
} from 'lucide-react'
import { store } from '@/lib/store'

function useStoreValue<T>(sel: () => T): T {
  return useSyncExternalStore(store.subscribe, sel, sel)
}

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
  const [dbProjects, setDbProjects] = useState<ProjectRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const storeProjects = useStoreValue(store.getProjects)

  // Hydrate store from disk on first load
  useEffect(() => { store.hydrate().catch(() => {}) }, [])

  // Fetch DB projects
  useEffect(() => {
    let cancelled = false
    fetch('/api/projects', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (!data.ok) {
          setError(data.error || 'failed_to_load')
          setDbProjects([])
          return
        }
        setDbProjects(data.projects ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setDbProjects([])
      })
    return () => { cancelled = true }
  }, [])

  // Merge store + DB projects, deduplicate by ID, sort newest first
  const projects: ProjectRow[] = (() => {
    const dbRows = dbProjects ?? []
    const dbIds = new Set(dbRows.map(p => p.id))

    // Convert store projects to ProjectRow format (for ones not in DB)
    const storeOnly: ProjectRow[] = storeProjects
      .filter(sp => !dbIds.has(sp.id))
      .map(sp => ({
        id: sp.id,
        name: sp.name,
        description: null,
        status: sp.status,
        source: 'local',
        created_at: sp.createdAt,
        updated_at: null,
        product_id: null,
        products: null,
        counts: {
          reports: 0,
          landingPages: 0,
          assets: sp.assets.length,
        },
      }))

    const merged = [...storeOnly, ...dbRows]
    merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    return merged
  })()

  const loading = dbProjects === null
  const total = projects.length

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)', fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
    >
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1
            style={{ lineHeight: '1.07', color: 'var(--text-1)' }}
            className="text-5xl font-semibold tracking-tight mb-2"
          >
            Projects
          </h1>
          <p style={{ color: 'var(--text-4)' }} className="text-base">
            {loading ? 'Loading…' : `${total} project${total !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{ backgroundColor: 'rgba(255,82,82,0.08)', borderColor: 'rgba(255,82,82,0.2)' }}
            className="rounded-lg p-4 mb-8 border max-w-2xl text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <div>
              <div className="font-medium mb-1" style={{ color: 'var(--danger)' }}>Failed to load projects</div>
              <div className="text-xs" style={{ color: 'var(--danger)' }}>{error}</div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex items-center gap-2 text-sm py-12" style={{ color: 'var(--text-4)' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading projects…
          </div>
        )}

        {/* Empty state */}
        {!loading && total === 0 && !error && (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: 'var(--border)' }}>
              <FolderKanban className="w-10 h-10" style={{ color: 'var(--text-5)' }} />
            </div>
            <h2 style={{ lineHeight: '1.1', color: 'var(--text-1)' }} className="text-2xl font-semibold mb-3">
              No projects yet
            </h2>
            <p style={{ color: 'var(--text-4)' }} className="text-base">
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
                style={{ backgroundColor: 'var(--surface-1)' }}
                className="w-full text-left rounded-lg overflow-hidden hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    style={{ backgroundColor: 'var(--brand-light)' }}
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <FolderKanban className="w-6 h-6" style={{ color: 'var(--brand)' }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3
                        style={{ lineHeight: '1.1', color: 'var(--text-1)' }}
                        className="text-base font-semibold truncate"
                      >
                        {proj.name}
                      </h3>
                      {proj.source === 'auto' && (
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-4)' }}>
                          auto
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Clock className="w-3 h-3" style={{ color: 'var(--text-4)' }} />
                      <span style={{ color: 'var(--text-4)' }} className="text-xs">
                        {timeAgo(proj.created_at)}
                      </span>
                      {proj.products?.name && (
                        <>
                          <span style={{ color: 'var(--text-5)' }}>·</span>
                          <span style={{ color: 'var(--text-4)' }} className="text-xs truncate">
                            {proj.products.name}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Counts row */}
                    <div className="flex items-center gap-3 mt-2">
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: 'var(--text-3)' }}
                      >
                        <FileText className="w-3 h-3" />
                        {proj.counts.reports} report{proj.counts.reports !== 1 ? 's' : ''}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: 'var(--text-3)' }}
                      >
                        <Layout className="w-3 h-3" />
                        {proj.counts.landingPages} landing
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: 'var(--text-3)' }}
                      >
                        <ImageIcon className="w-3 h-3" />
                        {proj.counts.assets} asset{proj.counts.assets !== 1 ? 's' : ''}
                      </span>
                      {totalArtifacts === 0 && (
                        <span className="text-[11px] italic" style={{ color: 'var(--text-4)' }}>
                          empty — generate something to fill it
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast)' }}
                    className="px-4 py-2 rounded-full text-sm font-medium flex-shrink-0"
                  >
                    Open
                  </span>
                  <ChevronRight
                    className="w-5 h-5 flex-shrink-0"
                    style={{ color: 'var(--text-5)' }}
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
