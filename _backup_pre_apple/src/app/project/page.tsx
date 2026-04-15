'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, FolderKanban, FileText, Image as ImageIcon, Scroll, Video,
  MoreHorizontal, Clock, ChevronRight, Sparkles, CheckCircle2, Loader2, AlertCircle, HardDrive
} from 'lucide-react'
import { store, ProjectRecord } from '@/lib/store'

interface StorageInfo {
  projectsDir: string
  dataDir: string
  exists: boolean
  fileCount: number
  totalBytes: number
  schemaVersion: number
}

function useStoreValue<T>(sel: () => T): T {
  return useSyncExternalStore(store.subscribe, sel, sel)
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

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-medium"><CheckCircle2 className="w-3 h-3" />Done</span>
    case 'generating':
      return <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 font-medium"><Loader2 className="w-3 h-3 animate-spin" />Generating</span>
    case 'evaluating':
      return <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium"><Loader2 className="w-3 h-3 animate-spin" />Evaluating</span>
    case 'failed':
      return <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100 font-medium"><AlertCircle className="w-3 h-3" />Failed</span>
    default:
      return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-100 font-medium">{status}</span>
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function ProjectPage() {
  const router = useRouter()
  const projects = useStoreValue(store.getProjects)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  // PCEC cycle 3 (C12): pull persisted projects from disk on first mount
  useEffect(() => {
    let cancelled = false
    store.hydrate().then((info) => {
      if (cancelled) return
      if (info.storage) setStorage(info.storage as StorageInfo)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Projects</h1>
          <p className="text-sm text-gray-400 mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        {storage && (
          <div
            className="flex items-start gap-2 max-w-md text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
            title="项目自动持久化到这个目录 (PCEC cycle 3, C12)"
          >
            <HardDrive className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-gray-700 mb-0.5">存储位置</div>
              <div className="font-mono break-all leading-tight">{storage.projectsDir}</div>
              <div className="text-gray-400 mt-0.5">
                {storage.fileCount} 个文件 · {formatBytes(storage.totalBytes)} · schema v{storage.schemaVersion}
                {!storage.exists && ' · (尚未创建，写入第一个项目时自动建立)'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <FolderKanban className="w-7 h-7 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No projects yet</h3>
          <p className="text-sm text-gray-400 mb-4">Go to Home and start generating to create your first project</p>
        </div>
      )}

      {/* Project List */}
      <div className="space-y-4">
        {projects.map(proj => (
          <div key={proj.id} className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Project header */}
            <div className="w-full flex items-center gap-4 p-5 hover:bg-gray-50/50 transition-colors">
              <button
                onClick={() => router.push(`/project/${proj.id}`)}
                className="flex items-center gap-4 flex-1 min-w-0 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100 flex-shrink-0">
                  <FolderKanban className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-gray-900 truncate">{proj.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-400">{timeAgo(proj.createdAt)}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{proj.jobs.length} generation{proj.jobs.length !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{proj.assets.length} asset{proj.assets.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </button>
              <button
                onClick={() => router.push(`/project/${proj.id}`)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors flex-shrink-0"
              >
                Open
              </button>
              <button
                onClick={() => setExpandedId(expandedId === proj.id ? null : proj.id)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${expandedId === proj.id ? 'rotate-90' : ''}`} />
              </button>
            </div>

            {/* Expanded: show jobs */}
            {expandedId === proj.id && (
              <div className="border-t border-[var(--border-light)] px-5 py-4 space-y-3 bg-[var(--bg-secondary)]">
                {proj.jobs.map(job => (
                  <div key={job.id} className="bg-white border border-[var(--border)] rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {job.type === 'image' ? <ImageIcon className="w-4 h-4 text-purple-500" /> : <Video className="w-4 h-4 text-blue-500" />}
                        <span className="text-xs font-semibold text-gray-700 uppercase">{job.type}</span>
                        <span className="text-[11px] text-gray-400">{timeAgo(job.createdAt)}</span>
                      </div>
                      {statusBadge(job.status)}
                    </div>

                    <p className="text-[13px] text-gray-600 mb-3 line-clamp-2">{job.prompt}</p>

                    {/* Show image if available */}
                    {job.imageData && (
                      <div className="mb-3">
                        <img src={job.imageData} alt="Generated" className="w-full max-h-[200px] object-contain rounded-lg bg-gray-50 border border-[var(--border-light)]" />
                      </div>
                    )}

                    {/* Show video if available */}
                    {(job.videoUrl || job.videoData) && (
                      <div className="mb-3">
                        <video src={job.videoData || job.videoUrl} controls className="w-full max-h-[200px] rounded-lg bg-black" />
                      </div>
                    )}

                    {/* Show evaluation scores */}
                    {job.evaluation && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[11px] text-gray-400">D1-D4:</span>
                        {['d1_spec', 'd2_content', 'd3_expression', 'd4_competitive'].map((key, i) => {
                          const score = (job.evaluation as any)?.[key]?.score || 0
                          return (
                            <span key={key} className={`text-xs font-bold ${score >= 8 ? 'text-emerald-600' : score >= 6 ? 'text-amber-500' : 'text-red-500'}`}>
                              {score}
                            </span>
                          )
                        })}
                        <span className="text-xs font-bold text-gray-900 ml-auto">
                          Overall: {(job.evaluation as any)?.overall?.toFixed(1) || 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
