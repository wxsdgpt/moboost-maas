'use client'

import { useState, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap, Image, Search, FileText, Paperclip,
  ArrowUp, Sparkles, ImageIcon, Video, FolderKanban, Clock
} from 'lucide-react'
import { store, generateThinkingSteps, GenerationJob } from '@/lib/store'
import type { QuickAction } from '@/types'

const TEMPLATES = [
  { id: 't1', name: 'Sports Betting Hero', category: 'Sports', preview: '🏈', desc: 'High-energy sports CTA with live odds' },
  { id: 't2', name: 'Casino Welcome Bonus', category: 'Casino', preview: '🎰', desc: 'Welcome offer with deposit match' },
  { id: 't3', name: 'Esports Tournament', category: 'Esports', preview: '🎮', desc: 'Tournament promo with team showcase' },
  { id: 't4', name: 'Live Dealer Promo', category: 'Casino', preview: '🃏', desc: 'Immersive live dealer experience' },
  { id: 't5', name: 'Parlay Builder', category: 'Sports', preview: '📊', desc: 'Multi-bet builder promotional' },
  { id: 't6', name: 'Mobile App Download', category: 'General', preview: '📱', desc: 'App store conversion landing' },
]

function detectIntent(text: string): 'image' | 'video' {
  const lower = text.toLowerCase()
  const videoKeywords = ['视频', 'video', 'clip', '动画', 'animation', 'motion', 'veo', '短片']
  if (videoKeywords.some(k => lower.includes(k))) return 'video'
  return 'image'
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

export default function HomePage() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const projects = useStoreValue(store.getProjects)

  const quickActions = [
    { key: 'pipeline' as QuickAction, icon: Zap, label: '一键联动', desc: '采集+素材+落地页', accent: true },
    { key: 'generate_asset' as QuickAction, icon: Image, label: '生成素材', desc: '图片或视频' },
    { key: 'intel_only' as QuickAction, icon: Search, label: '信息采集', desc: '竞品情报' },
    { key: 'generate_landing' as QuickAction, icon: FileText, label: '生成落地页', desc: '基于模板' },
  ]

  // ===== Submit: create project + job, redirect to workspace =====
  const handleSubmit = () => {
    if (!input.trim() && !activeAction) return
    const userInput = input.trim() || `[${activeAction}] 开始执行`
    const intent = detectIntent(userInput)

    // Create project with user message
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: userInput,
      timestamp: new Date().toISOString(),
    }
    const projectName = userInput.slice(0, 40) + (userInput.length > 40 ? '...' : '')
    const project = store.createProject(projectName, userMsg)

    // Create initial job
    const steps = generateThinkingSteps(intent, userInput)
    const job: GenerationJob = {
      id: `job-${Date.now()}`,
      projectId: project.id,
      type: intent,
      prompt: userInput,
      status: 'routing',
      createdAt: new Date().toISOString(),
      thinkingSteps: steps,
    }
    store.addJobToProject(project.id, job)

    setInput('')
    setActiveAction(null)

    // Navigate to workspace — the workspace will auto-detect the pending job and start generation
    router.push(`/project/${project.id}`)
  }

  const handleQuickAction = (action: QuickAction) => {
    setActiveAction(prev => prev === action ? null : action)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 flex flex-col items-center pt-[12vh] px-8">
        <div className="w-full max-w-[720px]">

          {/* Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 mb-5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">Moboost AI MAAS</span>
            </div>
            <h1 className="text-[32px] font-bold tracking-tight text-gray-900 mb-2">
              What would you like to create?
            </h1>
            <p className="text-gray-400 text-[15px]">
              Ad creatives, landing pages, and competitive intelligence for iGaming
            </p>
          </div>

          {/* Large Input Box */}
          <div className="input-glow bg-white border border-[var(--border)] rounded-2xl shadow-sm mb-4">
            <div className="px-5 pt-4 pb-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder="Describe what you want to create... e.g. 生成一张体育博彩的广告banner, 1200x628"
                rows={3}
                className="w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 resize-none outline-none leading-relaxed"
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-light)]">
              <div className="flex items-center gap-1">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                  <Paperclip className="w-3.5 h-3.5" /><span>Attach</span>
                </button>
                <input type="file" ref={fileRef} className="hidden" accept="image/*,video/*,.pdf,.doc,.docx" multiple />
                <button onClick={() => { setInput(p => p + ' [image]'); textareaRef.current?.focus() }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                  <ImageIcon className="w-3.5 h-3.5" /><span>Image</span>
                </button>
                <button onClick={() => { setInput(p => p + ' [video]'); textareaRef.current?.focus() }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                  <Video className="w-3.5 h-3.5" /><span>Video</span>
                </button>
              </div>
              <button
                onClick={handleSubmit}
                disabled={!input.trim() && !activeAction}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  input.trim() || activeAction ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-200' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                <ArrowUp className="w-4 h-4" /> Send
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mb-10">
            {quickActions.map(({ key, icon: Icon, label, desc, accent }) => (
              <button key={key} onClick={() => handleQuickAction(key)} className={`
                flex-1 flex items-center gap-2.5 px-4 py-3 rounded-xl text-left transition-all border
                ${activeAction === key ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : accent ? 'bg-emerald-50/60 border-emerald-100 text-emerald-700 hover:bg-emerald-50'
                  : 'bg-white border-[var(--border)] text-gray-600 hover:border-gray-300 hover:shadow-sm'}
              `}>
                <Icon className={`w-4 h-4 flex-shrink-0 ${activeAction === key || accent ? 'text-emerald-600' : 'text-gray-400'}`} />
                <div>
                  <div className="text-xs font-semibold">{label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Recent Projects (from store) */}
          <div className="mb-8">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Your Projects
            </div>
            <div className="flex gap-3">
              {projects.length === 0 ? (
                <div className="flex-1 px-4 py-6 rounded-xl border border-dashed border-gray-200 text-center text-xs text-gray-400">
                  No projects yet — start by creating something above
                </div>
              ) : (
                <>
                  {projects.slice(0, 3).map(proj => (
                    <button
                      key={proj.id}
                      onClick={() => router.push(`/project/${proj.id}`)}
                      className="card-hover flex-1 px-4 py-3.5 rounded-xl bg-white border border-[var(--border)] text-left"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <FolderKanban className="w-3.5 h-3.5 text-emerald-500" />
                        <div className="text-sm font-semibold text-gray-900 truncate">{proj.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-gray-300" />
                        <span className="text-xs text-gray-400">{timeAgo(proj.createdAt)}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{proj.assets.length} assets</span>
                      </div>
                    </button>
                  ))}
                  {projects.length <= 3 && (
                    <button
                      onClick={() => router.push('/project')}
                      className="flex-shrink-0 px-4 py-3.5 rounded-xl border border-dashed border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-gray-400 text-sm flex items-center justify-center gap-1.5 min-w-[100px]"
                    >
                      All →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Templates */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Templates</div>
            <div className="grid grid-cols-3 gap-3">
              {TEMPLATES.map(t => (
                <button key={t.id} className="card-hover px-4 py-4 rounded-xl bg-white border border-[var(--border)] text-left group">
                  <div className="text-2xl mb-2">{t.preview}</div>
                  <div className="text-[13px] font-semibold text-gray-900">{t.name}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{t.desc}</div>
                  <div className="mt-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium border border-emerald-100">{t.category}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
