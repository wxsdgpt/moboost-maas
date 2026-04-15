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
import RemoteProjectView from './RemoteProjectView'
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

function scoreColor(s: number) { return s >= 8 ? 'text-blue-600' : s >= 6 ? 'text-amber-500' : 'text-red-500' }
function scoreBg(s: number) { return s >= 8 ? 'bg-blue-50 border-blue-100' : s >= 6 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100' }

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

  // Not in localStorage — fall back to the read-only DB-backed view so
  // server-generated projects (auto-created when a report or landing page
  // is generated) are still reachable. RemoteProjectView handles its own
  // loading/error/not-found states.
  if (!project) {
    return <RemoteProjectView projectId={projectId} />
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      store.updateMessageInProject(projectId, genMsgId, {
        content: `网络错误: ${message}`, isGenerating: false, error: message,
      })
      store.updateJobInProject(projectId, jobId, { status: 'failed', error: message })
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      store.updateMessageInProject(projectId, genMsgId, {
        content: `网络错误: ${message}`, isGenerating: false, error: message,
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      store.updateMessageInProject(projectId, evalMsgId, {
        content: `评估错误: ${message}`, isEvaluating: false, error: message,
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
      <div style={{ backgroundColor: '#f5f5f7', border: '1px solid #e5e5e7' }} className="rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#0071e3' }} />
          <span style={{ color: '#0071e3' }} className="text-[10px] font-semibold uppercase tracking-wider">Evaluation</span>
          <span style={{ color: 'rgba(0,0,0,0.8)' }} className="ml-auto text-base font-semibold">
            {evaluation.overall?.toFixed(1) || 'N/A'}<span style={{ color: 'rgba(0,0,0,0.48)' }} className="text-[10px]">/10</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {dims.map(({ key, label, data }) => (
            <div key={key} style={{ backgroundColor: data?.score || 0 >= 8 ? '#e8f4ff' : data?.score || 0 >= 6 ? '#fef3c7' : '#fee2e2', border: '1px solid ' + (data?.score || 0 >= 8 ? '#b3deff' : data?.score || 0 >= 6 ? '#fde68a' : '#fecaca') }} className="px-2.5 py-2 rounded-md">
              <div className="flex items-center justify-between">
                <span style={{ color: 'rgba(0,0,0,0.48)' }} className="text-[9px] font-semibold uppercase">{key}</span>
                <span className={`text-xs font-bold ${scoreColor(data?.score || 0)}`}>{data?.score || 0}</span>
              </div>
              <p style={{ color: 'rgba(0,0,0,0.48)' }} className="text-[10px] mt-0.5 line-clamp-1">{data?.details || ''}</p>
            </div>
          ))}
        </div>
        {evaluation.suggestion && (
          <p style={{ backgroundColor: '#e8f4ff', color: '#0066cc' }} className="text-[10px] rounded px-2 py-1.5">{evaluation.suggestion}</p>
        )}
      </div>
    )
  }

  // ============================================================
  //  THREE-COLUMN LAYOUT
  // ============================================================
  const rightPanelWidth = 380

  return (
    <div style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }} className="flex h-screen bg-white">

      {/* ===== LEFT: Asset Thumbnails Strip (80px) ===== */}
      <div style={{ backgroundColor: '#f5f5f7', borderRight: '1px solid #e5e5e7' }} className="w-[80px] flex-shrink-0 flex flex-col">
        <div style={{ borderBottom: '1px solid #e5e5e7' }} className="px-2 py-3">
          <button onClick={() => router.push('/project')} style={{ color: 'rgba(0,0,0,0.48)' }} className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white transition-colors" title="Back to Projects">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-2">
          {assets.map(asset => (
            <div
              key={asset.id}
              onClick={() => store.selectAsset(projectId, asset.id)}
              style={{
                borderWidth: '2px',
                borderColor: project.selectedAssetId === asset.id ? '#0071e3' : 'transparent',
                boxShadow: project.selectedAssetId === asset.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
              className="group relative rounded-lg overflow-hidden cursor-pointer transition-all hover:border-gray-300"
            >
              {asset.type === 'image' && asset.imageData ? (
                <img src={asset.imageData} alt="" className="w-full aspect-square object-cover" />
              ) : asset.type === 'video' ? (
                <div className="w-full aspect-square bg-gray-900 flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div style={{ backgroundColor: '#f5f5f7' }} className="w-full aspect-square flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" style={{ color: 'rgba(0,0,0,0.2)' }} />
                </div>
              )}
              {/* Delete button on hover */}
              <button
                onClick={(e) => { e.stopPropagation(); store.removeAssetFromProject(projectId, asset.id) }}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}

          {assets.length === 0 && (
            <div className="text-center py-4">
              <ImageIcon className="w-5 h-5" style={{ color: 'rgba(0,0,0,0.1)' }} />
              <p style={{ color: 'rgba(0,0,0,0.48)' }} className="text-[9px] mt-1">No assets</p>
            </div>
          )}
        </div>
      </div>

      {/* ===== CENTER: Main Canvas ===== */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {selectedAsset ? (
          <>
            {/* Canvas toolbar */}
            <div style={{ borderBottom: '1px solid #e5e5e7' }} className="px-4 py-3 bg-white flex items-center gap-2">
              <span style={{ color: 'rgba(0,0,0,0.48)' }} className="text-xs flex-1 truncate">{selectedAsset.prompt}</span>
              <button style={{ color: 'rgba(0,0,0,0.48)' }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Zoom">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button style={{ color: 'rgba(0,0,0,0.48)' }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button style={{ color: 'rgba(0,0,0,0.48)' }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Download">
                <Download className="w-4 h-4" />
              </button>
            </div>
            {/* Canvas content */}
            <div style={{ backgroundColor: '#f5f5f7' }} className="flex-1 flex items-center justify-center p-6 overflow-auto">
              {selectedAsset.type === 'image' && selectedAsset.imageData ? (
                <img src={selectedAsset.imageData} alt="Asset" className="max-w-full max-h-full object-contain rounded-xl" style={{ boxShadow: '0 3px 8px rgba(0,0,0,0.12)' }} />
              ) : selectedAsset.type === 'video' && (selectedAsset.videoData || selectedAsset.videoUrl) ? (
                <video src={selectedAsset.videoData || selectedAsset.videoUrl} controls className="max-w-full max-h-full rounded-xl bg-black" style={{ boxShadow: '0 3px 8px rgba(0,0,0,0.12)' }} />
              ) : (
                <div style={{ color: 'rgba(0,0,0,0.48)' }} className="text-sm">Loading...</div>
              )}
            </div>
            {/* Evaluation below canvas */}
            {selectedAsset.evaluation && (
              <div style={{ borderTop: '1px solid #e5e5e7', backgroundColor: 'white' }} className="px-6 py-3">
                {renderEvaluation(selectedAsset.evaluation)}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ImageIcon className="w-12 h-12 mx-auto mb-3" style={{ color: 'rgba(0,0,0,0.08)' }} />
              <p style={{ color: 'rgba(0,0,0,0.48)' }} className="text-sm">在右侧输入描述来生成素材</p>
              <p style={{ color: 'rgba(0,0,0,0.32)' }} className="text-xs mt-1">生成的图片和视频会显示在这里</p>
            </div>
          </div>
        )}
      </div>

      {/* ===== RIGHT: Chat & Thinking Panel ===== */}
      <div style={{ width: rightPanelWidth, minWidth: rightPanelWidth, backgroundColor: 'white', borderLeft: '1px solid #e5e5e7' }} className="flex-shrink-0 flex flex-col">
        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={`animate-fade-in ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
              {msg.role === 'user' && (
                <div style={{ backgroundColor: '#e8f4ff', color: '#0051ba', border: '1px solid #b3deff' }} className="max-w-[90%] px-3 py-2 rounded-2xl text-[13px]">
                  {msg.content}
                </div>
              )}
              {msg.role === 'assistant' && (
                <div className="max-w-[95%]">
                  {/* Evaluation card */}
                  {msg.evaluation && renderEvaluation(msg.evaluation)}

                  {/* Loading */}
                  {(msg.isGenerating || msg.isEvaluating) && !msg.evaluation && (
                    <div style={{ backgroundColor: '#f5f5f7', color: 'rgba(0,0,0,0.8)', border: '1px solid #e5e5e7' }} className="flex items-center gap-2 px-3 py-2 rounded-2xl text-[13px]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#0071e3' }} />
                      <span className="truncate">{msg.content}</span>
                    </div>
                  )}

                  {/* Error */}
                  {msg.error && !msg.isGenerating && !msg.evaluation && (
                    <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }} className="px-3 py-2 rounded-2xl text-[13px] flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span className="truncate">{msg.content}</span>
                    </div>
                  )}

                  {/* Image result */}
                  {!msg.isGenerating && !msg.error && !msg.evaluation && (msg.imageData || (msg.allImages && msg.allImages.length > 0)) && (
                    <div style={{ border: '1px solid #e5e5e7' }} className="rounded-xl overflow-hidden">
                      <img src={msg.imageData || msg.allImages?.[0]} alt="" className="w-full max-h-[200px] object-contain bg-white" />
                      {msg.content && <p style={{ color: 'rgba(0,0,0,0.48)' }} className="px-3 py-2 text-[11px]">{msg.content}</p>}
                    </div>
                  )}

                  {/* Video result */}
                  {!msg.isGenerating && !msg.error && !msg.evaluation && (msg.videoData || msg.videoUrl) && (
                    <div style={{ border: '1px solid #e5e5e7' }} className="rounded-xl overflow-hidden">
                      <video src={msg.videoData || msg.videoUrl} controls className="w-full max-h-[200px] bg-black" />
                    </div>
                  )}

                  {/* Plain text */}
                  {!msg.isGenerating && !msg.isEvaluating && !msg.error && !msg.imageData && !(msg.allImages?.length) && !msg.evaluation && !msg.videoData && !msg.videoUrl && msg.content && (
                    <div style={{ backgroundColor: '#f5f5f7', color: 'rgba(0,0,0,0.8)', border: '1px solid #e5e5e7' }} className="px-3 py-2 rounded-2xl text-[13px]">
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
        <div style={{ borderTop: '1px solid #e5e5e7' }} className="px-3 py-3">
          <div style={{ backgroundColor: '#f5f5f7', border: '1px solid #e5e5e7' }} className="rounded-2xl">
            <div className="flex items-end gap-2 p-2.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder="描述你想生成的内容..."
                rows={2}
                style={{ color: 'rgba(0,0,0,0.8)' }}
                className="flex-1 bg-transparent text-[13px] placeholder:text-gray-400 resize-none outline-none leading-relaxed"
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isProcessing}
                style={{
                  backgroundColor: input.trim() && !isProcessing ? '#0071e3' : '#e5e5e7',
                  color: input.trim() && !isProcessing ? 'white' : 'rgba(0,0,0,0.2)'
                }}
                className="p-2 rounded-lg transition-all flex-shrink-0"
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
