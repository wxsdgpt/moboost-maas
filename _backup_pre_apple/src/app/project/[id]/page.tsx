'use client'

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowUp, Paperclip, ImageIcon, Video, Loader2,
  Trash2, ArrowLeft, Play, CheckCircle2, AlertCircle,
  ThumbsUp, ThumbsDown, ZoomIn, Download, Pencil
} from 'lucide-react'
import ModelRouter from '@/components/ModelRouter'
import ThinkingPanel from '@/components/ThinkingPanel'
import {
  store, generateThinkingSteps, pollVideoJob,
  GenerationJob, GeneratedAsset, ThinkingStep, ChatMessage as StoreChatMessage
} from '@/lib/store'
import type { ModelCandidate, AssetEvaluation } from '@/types'

function useStoreValue<T>(sel: () => T): T {
  return useSyncExternalStore(store.subscribe, sel, sel)
}

function detectIntent(text: string): 'image' | 'video' {
  const lower = text.toLowerCase()
  const videoKw = ['视频', 'video', 'clip', '动画', 'animation', 'motion', 'veo', '短片']
  return videoKw.some(k => lower.includes(k)) ? 'video' : 'image'
}

function scoreColor(s: number) { return s >= 8 ? 'text-emerald-600' : s >= 6 ? 'text-amber-500' : 'text-red-500' }
function scoreBg(s: number) { return s >= 8 ? 'bg-emerald-50 border-emerald-100' : s >= 6 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100' }

export default function ProjectWorkspace() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const projects = useStoreValue(store.getProjects)
  const project = projects.find(p => p.id === projectId)

  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showRouter, setShowRouter] = useState(false)
  const [routerType, setRouterType] = useState<'image' | 'video'>('image')
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  useEffect(() => { store.setSidebarCollapsed(isProcessing) }, [isProcessing])

  // Auto-start generation for pending 'routing' jobs (created from Home page redirect)
  const [autoStarted, setAutoStarted] = useState(false)
  useEffect(() => {
    if (autoStarted || !project) return
    const pendingJob = project.jobs.find(j => j.status === 'routing')
    if (!pendingJob) return
    setAutoStarted(true)

    // Start the generation flow
    setCurrentPrompt(pendingJob.prompt)
    setIsProcessing(true)
    const steps = generateThinkingSteps(pendingJob.type, pendingJob.prompt)
    setThinkingSteps(steps)
    setShowRouter(true)
    setRouterType(pendingJob.type)
    scrollToBottom()
  }, [project, autoStarted, scrollToBottom])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Project not found</p>
          <button onClick={() => router.push('/project')} className="text-sm text-emerald-600 hover:underline">Back to Projects</button>
        </div>
      </div>
    )
  }

  const messages = project.messages
  const assets = project.assets
  const selectedAsset = project.assets.find(a => a.id === project.selectedAssetId)

  // ===== Image generation =====
  const callGenerateImage = async (prompt: string, jobId: string) => {
    const genMsgId = `msg-gen-${Date.now()}`
    store.addMessageToProject(projectId, {
      id: genMsgId, role: 'assistant', content: '正在使用 NanoBanana Pro 生成图片...',
      timestamp: new Date().toISOString(), jobId, isGenerating: true,
    })
    scrollToBottom()

    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: 'image' }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        store.updateMessageInProject(projectId, genMsgId, {
          content: `生成失败: ${typeof data.error === 'string' ? data.error.slice(0, 200) : 'Error'}`,
          isGenerating: false, error: data.error,
        })
        store.updateJobInProject(projectId, jobId, { status: 'failed', error: data.error })
        setIsProcessing(false)
        return
      }

      // Update message
      store.updateMessageInProject(projectId, genMsgId, {
        content: data.result || '', imageData: data.imageData,
        allImages: data.allImages?.length > 0 ? data.allImages : undefined,
        isGenerating: false,
      })

      // Add asset(s)
      const images = data.allImages?.length > 0 ? data.allImages : (data.imageData ? [data.imageData] : [])
      images.forEach((img: string, i: number) => {
        store.addAssetToProject(projectId, {
          id: `asset-${Date.now()}-${i}`, jobId, type: 'image',
          imageData: img, thumbnailData: img,
          prompt, createdAt: new Date().toISOString(),
        })
      })

      store.updateJobInProject(projectId, jobId, {
        status: 'evaluating', imageData: data.imageData, allImages: data.allImages, resultText: data.result,
      })

      // D1-D4 Evaluation
      await callEvaluate(prompt, data.result || '', jobId)
    } catch (err: any) {
      store.updateMessageInProject(projectId, genMsgId, {
        content: `网络错误: ${err.message}`, isGenerating: false, error: err.message,
      })
      store.updateJobInProject(projectId, jobId, { status: 'failed', error: err.message })
    }

    setIsProcessing(false)
    store.addNotification({ type: 'success', title: '图片生成完成', message: prompt.slice(0, 50), projectId })
  }

  // ===== Video generation =====
  const callGenerateVideo = async (prompt: string, jobId: string) => {
    const genMsgId = `msg-gen-${Date.now()}`
    store.addMessageToProject(projectId, {
      id: genMsgId, role: 'assistant', content: '正在提交 VEO3 视频生成任务...',
      timestamp: new Date().toISOString(), jobId, isGenerating: true,
    })
    scrollToBottom()

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', prompt }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        store.updateMessageInProject(projectId, genMsgId, {
          content: `视频提交失败: ${data.error?.slice?.(0, 200) || 'Error'}`,
          isGenerating: false, error: data.error,
        })
        store.updateJobInProject(projectId, jobId, { status: 'failed', error: data.error })
        setIsProcessing(false)
        return
      }

      store.updateJobInProject(projectId, jobId, { status: 'generating', videoJobId: data.jobId })
      store.updateMessageInProject(projectId, genMsgId, {
        content: `VEO3 任务已提交。视频渲染中 (~70s)，完成后会通知你。`,
        isGenerating: true, // Keep spinner while polling
      })
      setIsProcessing(false)

      // Background polling
      pollVideoJob(projectId, jobId, data.jobId, prompt)
    } catch (err: any) {
      store.updateMessageInProject(projectId, genMsgId, {
        content: `网络错误: ${err.message}`, isGenerating: false, error: err.message,
      })
      setIsProcessing(false)
    }
  }

  // ===== Evaluate =====
  const callEvaluate = async (brief: string, assetDesc: string, jobId: string) => {
    const evalMsgId = `msg-eval-${Date.now()}`
    store.addMessageToProject(projectId, {
      id: evalMsgId, role: 'assistant', content: 'D1-D4 素材评估中...',
      timestamp: new Date().toISOString(), isEvaluating: true,
    })
    scrollToBottom()

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetDescription: assetDesc || 'Generated creative', brief, referenceDescriptions: [] }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        store.updateMessageInProject(projectId, evalMsgId, {
          content: `评估失败: ${data.error || 'Unknown'}`, isEvaluating: false, error: data.error,
        })
      } else {
        store.updateMessageInProject(projectId, evalMsgId, {
          content: '', evaluation: data.evaluation, isEvaluating: false,
        })
        store.updateJobInProject(projectId, jobId, { status: 'completed', evaluation: data.evaluation, completedAt: new Date().toISOString() })
      }
      scrollToBottom()
    } catch (err: any) {
      store.updateMessageInProject(projectId, evalMsgId, {
        content: `评估错误: ${err.message}`, isEvaluating: false, error: err.message,
      })
    }
  }

  // ===== Submit =====
  const handleSubmit = () => {
    if (!input.trim() || isProcessing) return
    const userInput = input.trim()
    const intent = detectIntent(userInput)

    store.addMessageToProject(projectId, {
      id: `msg-${Date.now()}`, role: 'user', content: userInput, timestamp: new Date().toISOString(),
    })
    setInput('')
    setCurrentPrompt(userInput)
    setIsProcessing(true)

    const steps = generateThinkingSteps(intent, userInput)
    setThinkingSteps(steps)

    const jobId = `job-${Date.now()}`
    const job: GenerationJob = {
      id: jobId, projectId, type: intent, prompt: userInput,
      status: 'routing', createdAt: new Date().toISOString(), thinkingSteps: steps,
    }
    store.addJobToProject(projectId, job)

    setShowRouter(true)
    setRouterType(intent)
    scrollToBottom()
  }

  const handleRouterComplete = (model: ModelCandidate) => {
    setTimeout(() => {
      setShowRouter(false)
      store.addMessageToProject(projectId, {
        id: `msg-router-${Date.now()}`, role: 'assistant',
        content: `已选择 **${model.name}** (匹配度 ${model.matchScore}%)`,
        timestamp: new Date().toISOString(),
      })
      scrollToBottom()

      // Get fresh project data from store
      const freshProject = store.getProject(projectId)
      const latestJob = freshProject?.jobs[freshProject.jobs.length - 1]
      if (!latestJob) return
      store.updateJobInProject(projectId, latestJob.id, { status: 'generating' })

      if (model.type === 'video') {
        callGenerateVideo(currentPrompt, latestJob.id)
      } else {
        callGenerateImage(currentPrompt, latestJob.id)
      }
    }, 500)
  }

  // ===== Render evaluation =====
  const renderEvaluation = (evaluation: AssetEvaluation) => {
    const dims = [
      { key: 'D1', label: '规格合规', data: evaluation.d1_spec },
      { key: 'D2', label: '内容完整性', data: evaluation.d2_content },
      { key: 'D3', label: '表达力', data: evaluation.d3_expression },
      { key: 'D4', label: '竞争优势', data: evaluation.d4_competitive },
    ]
    return (
      <div className="bg-white rounded-lg border border-[var(--border)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Evaluation</span>
          <span className="ml-auto text-base font-bold text-gray-900">
            {evaluation.overall?.toFixed(1) || 'N/A'}<span className="text-[10px] text-gray-400">/10</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {dims.map(({ key, label, data }) => (
            <div key={key} className={`px-2.5 py-2 rounded-md border ${scoreBg(data?.score || 0)}`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold text-gray-500 uppercase">{key}</span>
                <span className={`text-xs font-bold ${scoreColor(data?.score || 0)}`}>{data?.score || 0}</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{data?.details || ''}</p>
            </div>
          ))}
        </div>
        {evaluation.suggestion && (
          <p className="text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1.5">{evaluation.suggestion}</p>
        )}
      </div>
    )
  }

  // ============================================================
  //  THREE-COLUMN LAYOUT
  // ============================================================
  const rightPanelWidth = 380

  return (
    <div className="flex h-screen">

      {/* ===== LEFT: Asset Thumbnails Strip (80px) ===== */}
      <div className="w-[80px] flex-shrink-0 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col">
        <div className="px-2 py-3 border-b border-[var(--border-light)]">
          <button onClick={() => router.push('/project')} className="w-full flex items-center justify-center p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Back to Projects">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-2">
          {assets.map(asset => (
            <div
              key={asset.id}
              onClick={() => store.selectAsset(projectId, asset.id)}
              className={`
                group relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all
                ${project.selectedAssetId === asset.id ? 'border-emerald-500 shadow-sm' : 'border-transparent hover:border-gray-300'}
              `}
            >
              {asset.type === 'image' && asset.imageData ? (
                <img src={asset.imageData} alt="" className="w-full aspect-square object-cover" />
              ) : asset.type === 'video' ? (
                <div className="w-full aspect-square bg-gray-900 flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-gray-300" />
                </div>
              )}
              {/* Delete button on hover */}
              <button
                onClick={(e) => { e.stopPropagation(); store.removeAssetFromProject(projectId, asset.id) }}
                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}

          {assets.length === 0 && (
            <div className="text-center py-4">
              <ImageIcon className="w-5 h-5 text-gray-300 mx-auto" />
              <p className="text-[9px] text-gray-400 mt-1">No assets</p>
            </div>
          )}
        </div>
      </div>

      {/* ===== CENTER: Main Canvas ===== */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {selectedAsset ? (
          <>
            {/* Canvas toolbar */}
            <div className="px-4 py-2.5 border-b border-[var(--border-light)] bg-white flex items-center gap-2">
              <span className="text-xs text-gray-500 flex-1 truncate">{selectedAsset.prompt}</span>
              <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors" title="Zoom">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors" title="Download">
                <Download className="w-4 h-4" />
              </button>
            </div>
            {/* Canvas content */}
            <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
              {selectedAsset.type === 'image' && selectedAsset.imageData ? (
                <img src={selectedAsset.imageData} alt="Asset" className="max-w-full max-h-full object-contain rounded-lg shadow-md" />
              ) : selectedAsset.type === 'video' && (selectedAsset.videoData || selectedAsset.videoUrl) ? (
                <video src={selectedAsset.videoData || selectedAsset.videoUrl} controls className="max-w-full max-h-full rounded-lg shadow-md bg-black" />
              ) : (
                <div className="text-gray-400 text-sm">Loading...</div>
              )}
            </div>
            {/* Evaluation below canvas */}
            {selectedAsset.evaluation && (
              <div className="px-6 py-3 border-t border-[var(--border-light)] bg-white">
                {renderEvaluation(selectedAsset.evaluation)}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ImageIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">在右侧输入描述来生成素材</p>
              <p className="text-xs text-gray-300 mt-1">生成的图片和视频会显示在这里</p>
            </div>
          </div>
        )}
      </div>

      {/* ===== RIGHT: Chat & Thinking Panel ===== */}
      <div style={{ width: rightPanelWidth, minWidth: rightPanelWidth }} className="flex-shrink-0 flex flex-col bg-white border-l border-[var(--border)]">
        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={`animate-fade-in ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
              {msg.role === 'user' && (
                <div className="max-w-[90%] px-3 py-2 rounded-xl text-[13px] bg-emerald-50 text-emerald-900 border border-emerald-100">
                  {msg.content}
                </div>
              )}
              {msg.role === 'assistant' && (
                <div className="max-w-[95%]">
                  {/* Evaluation card */}
                  {msg.evaluation && renderEvaluation(msg.evaluation)}

                  {/* Loading */}
                  {(msg.isGenerating || msg.isEvaluating) && !msg.evaluation && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 text-gray-500 border border-[var(--border-light)] text-[13px]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      <span className="truncate">{msg.content}</span>
                    </div>
                  )}

                  {/* Error */}
                  {msg.error && !msg.isGenerating && !msg.evaluation && (
                    <div className="px-3 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 text-[13px] flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span className="truncate">{msg.content}</span>
                    </div>
                  )}

                  {/* Image result */}
                  {!msg.isGenerating && !msg.error && !msg.evaluation && (msg.imageData || (msg.allImages && msg.allImages.length > 0)) && (
                    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                      <img src={msg.imageData || msg.allImages?.[0]} alt="" className="w-full max-h-[200px] object-contain bg-gray-50" />
                      {msg.content && <p className="px-3 py-2 text-[11px] text-gray-500">{msg.content}</p>}
                    </div>
                  )}

                  {/* Video result */}
                  {!msg.isGenerating && !msg.error && !msg.evaluation && (msg.videoData || msg.videoUrl) && (
                    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                      <video src={msg.videoData || msg.videoUrl} controls className="w-full max-h-[200px] bg-black" />
                    </div>
                  )}

                  {/* Plain text */}
                  {!msg.isGenerating && !msg.isEvaluating && !msg.error && !msg.imageData && !(msg.allImages?.length) && !msg.evaluation && !msg.videoData && !msg.videoUrl && msg.content && (
                    <div className="px-3 py-2 rounded-xl text-[13px] bg-gray-50 text-gray-700 border border-[var(--border-light)]">
                      {msg.content}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {showRouter && (
            <div className="animate-fade-in">
              <ModelRouter taskType={routerType} onComplete={handleRouterComplete} />
            </div>
          )}

          {/* Thinking steps inline (compact) */}
          {isProcessing && thinkingSteps.length > 0 && (
            <div className="animate-fade-in">
              <ThinkingPanel steps={thinkingSteps} isActive={isProcessing} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input — bottom of right panel */}
        <div className="px-3 py-3 border-t border-[var(--border-light)]">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl">
            <div className="flex items-end gap-2 p-2.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder="描述你想生成的内容..."
                rows={2}
                className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 resize-none outline-none leading-relaxed"
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isProcessing}
                className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                  input.trim() && !isProcessing ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
