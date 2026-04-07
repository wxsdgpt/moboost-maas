'use client'

// ===== Global State Store =====
// Manages: generation jobs, projects, notifications, sidebar, conversations

export interface GenerationJob {
  id: string
  projectId: string
  type: 'image' | 'video'
  prompt: string
  status: 'routing' | 'generating' | 'evaluating' | 'completed' | 'failed'
  imageData?: string
  allImages?: string[]
  videoJobId?: string
  videoUrl?: string
  videoData?: string
  evaluation?: any
  resultText?: string
  error?: string
  createdAt: string
  completedAt?: string
  thinkingSteps: ThinkingStep[]
}

export interface ThinkingStep {
  id: string
  label: string
  detail: string
  status: 'pending' | 'active' | 'done'
  timestamp: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  // Attached generation results
  jobId?: string
  imageData?: string
  allImages?: string[]
  videoData?: string
  videoUrl?: string
  evaluation?: any
  isGenerating?: boolean
  isEvaluating?: boolean
  error?: string
}

export interface GeneratedAsset {
  id: string
  jobId: string
  type: 'image' | 'video'
  thumbnailData?: string // base64 image or first frame
  imageData?: string
  videoData?: string
  videoUrl?: string
  prompt: string
  evaluation?: any
  createdAt: string
}

export interface ProjectRecord {
  id: string
  name: string
  createdAt: string
  jobs: GenerationJob[]
  messages: ChatMessage[]       // Persisted conversation
  assets: GeneratedAsset[]       // All generated assets in this project
  selectedAssetId: string | null // Currently selected asset in canvas
  status: 'active' | 'archived'
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message: string
  projectId?: string
  timestamp: string
  read: boolean
}

// ===== In-memory store =====
let _projects: ProjectRecord[] = []
let _notifications: Notification[] = []
let _activeProjectId: string | null = null
let _sidebarCollapsed: boolean = false
let _listeners: Set<() => void> = new Set()

function emit() { _listeners.forEach(fn => fn()) }

export const store = {
  subscribe(fn: () => void) {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  // ===== Projects =====
  getProjects: () => _projects,
  getActiveProjectId: () => _activeProjectId,
  setActiveProjectId(id: string | null) { _activeProjectId = id; emit() },

  getProject: (id: string) => _projects.find(p => p.id === id),

  createProject(name: string, firstMessage?: ChatMessage): ProjectRecord {
    const project: ProjectRecord = {
      id: `proj-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      jobs: [],
      messages: firstMessage ? [firstMessage] : [],
      assets: [],
      selectedAssetId: null,
      status: 'active',
    }
    _projects = [project, ..._projects]
    _activeProjectId = project.id
    emit()
    return project
  },

  addMessageToProject(projectId: string, msg: ChatMessage) {
    _projects = _projects.map(p =>
      p.id === projectId ? { ...p, messages: [...p.messages, msg] } : p
    )
    emit()
  },

  updateMessageInProject(projectId: string, msgId: string, updates: Partial<ChatMessage>) {
    _projects = _projects.map(p =>
      p.id === projectId
        ? { ...p, messages: p.messages.map(m => m.id === msgId ? { ...m, ...updates } : m) }
        : p
    )
    emit()
  },

  addJobToProject(projectId: string, job: GenerationJob) {
    _projects = _projects.map(p =>
      p.id === projectId ? { ...p, jobs: [...p.jobs, job] } : p
    )
    emit()
  },

  updateJobInProject(projectId: string, jobId: string, updates: Partial<GenerationJob>) {
    _projects = _projects.map(p =>
      p.id === projectId
        ? { ...p, jobs: p.jobs.map(j => j.id === jobId ? { ...j, ...updates } : j) }
        : p
    )
    emit()
  },

  getJob(projectId: string, jobId: string): GenerationJob | undefined {
    return _projects.find(p => p.id === projectId)?.jobs.find(j => j.id === jobId)
  },

  // ===== Assets =====
  addAssetToProject(projectId: string, asset: GeneratedAsset) {
    _projects = _projects.map(p =>
      p.id === projectId
        ? { ...p, assets: [...p.assets, asset], selectedAssetId: asset.id }
        : p
    )
    emit()
  },

  removeAssetFromProject(projectId: string, assetId: string) {
    _projects = _projects.map(p => {
      if (p.id !== projectId) return p
      const newAssets = p.assets.filter(a => a.id !== assetId)
      return {
        ...p,
        assets: newAssets,
        selectedAssetId: p.selectedAssetId === assetId
          ? (newAssets.length > 0 ? newAssets[newAssets.length - 1].id : null)
          : p.selectedAssetId,
      }
    })
    emit()
  },

  selectAsset(projectId: string, assetId: string) {
    _projects = _projects.map(p =>
      p.id === projectId ? { ...p, selectedAssetId: assetId } : p
    )
    emit()
  },

  getSelectedAsset(projectId: string): GeneratedAsset | undefined {
    const p = _projects.find(p => p.id === projectId)
    return p?.assets.find(a => a.id === p.selectedAssetId)
  },

  // ===== Notifications =====
  getNotifications: () => _notifications,
  getUnreadCount: () => _notifications.filter(n => !n.read).length,

  addNotification(n: Omit<Notification, 'id' | 'timestamp' | 'read'>) {
    const notification: Notification = {
      ...n, id: `notif-${Date.now()}`, timestamp: new Date().toISOString(), read: false,
    }
    _notifications = [notification, ..._notifications]
    emit()
    return notification
  },

  markRead(id: string) {
    _notifications = _notifications.map(n => n.id === id ? { ...n, read: true } : n)
    emit()
  },

  markAllRead() {
    _notifications = _notifications.map(n => ({ ...n, read: true }))
    emit()
  },

  // ===== Sidebar =====
  isSidebarCollapsed: () => _sidebarCollapsed,
  setSidebarCollapsed(v: boolean) { _sidebarCollapsed = v; emit() },
}

// ===== Fake thinking steps =====
export function generateThinkingSteps(type: 'image' | 'video', prompt: string): ThinkingStep[] {
  const now = () => new Date().toISOString()
  if (type === 'image') {
    return [
      { id: 's1', label: '解析用户意图', detail: '识别生成类型: 营销图片素材', status: 'pending', timestamp: now() },
      { id: 's2', label: '分析 Brief 要素', detail: `提取关键词: ${prompt.slice(0, 50)}...`, status: 'pending', timestamp: now() },
      { id: 's3', label: 'Model Router 选择引擎', detail: '对比 4 个候选引擎的匹配度评分', status: 'pending', timestamp: now() },
      { id: 's4', label: '构建生成 Prompt', detail: '优化提示词结构，添加 iGaming 行业知识', status: 'pending', timestamp: now() },
      { id: 's5', label: '调用 NanoBanana Pro', detail: 'Google Gemini 3 Pro Image Generation', status: 'pending', timestamp: now() },
      { id: 's6', label: 'D1-D4 素材评估', detail: '规格合规 / 内容完整性 / 表达力 / 竞争优势', status: 'pending', timestamp: now() },
      { id: 's7', label: '生成完成', detail: '素材已保存到项目', status: 'pending', timestamp: now() },
    ]
  }
  return [
    { id: 's1', label: '解析用户意图', detail: '识别生成类型: 营销视频素材', status: 'pending', timestamp: now() },
    { id: 's2', label: '分析 Brief 要素', detail: `提取关键词: ${prompt.slice(0, 50)}...`, status: 'pending', timestamp: now() },
    { id: 's3', label: 'Model Router 选择引擎', detail: '对比 3 个视频引擎的匹配度评分', status: 'pending', timestamp: now() },
    { id: 's4', label: '构建视频 Prompt', detail: '优化提示词，添加运动镜头和节奏描述', status: 'pending', timestamp: now() },
    { id: 's5', label: '提交 VEO3 任务', detail: '异步视频生成已启动 (~70s)', status: 'pending', timestamp: now() },
    { id: 's6', label: '等待 VEO3 渲染', detail: '视频渲染中，可以离开页面', status: 'pending', timestamp: now() },
    { id: 's7', label: 'D1-D4 素材评估', detail: '规格合规 / 内容完整性 / 表达力 / 竞争优势', status: 'pending', timestamp: now() },
    { id: 's8', label: '生成完成', detail: '视频已保存到项目', status: 'pending', timestamp: now() },
  ]
}

// ===== Video polling =====
export async function pollVideoJob(
  projectId: string, jobId: string, videoJobId: string, prompt: string,
): Promise<void> {
  let attempts = 0
  const maxAttempts = 30

  const poll = async () => {
    attempts++
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll', jobId: videoJobId }),
      })
      const data = await res.json()

      if (data.status === 'completed') {
        const dlRes = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'download', jobId: videoJobId }),
        })
        const dlData = await dlRes.json()

        store.updateJobInProject(projectId, jobId, {
          status: 'completed', videoUrl: dlData.videoUrl, videoData: dlData.videoData, completedAt: new Date().toISOString(),
        })

        // Add asset
        store.addAssetToProject(projectId, {
          id: `asset-${Date.now()}`, jobId, type: 'video',
          videoData: dlData.videoData, videoUrl: dlData.videoUrl,
          prompt, createdAt: new Date().toISOString(),
        })

        // Update the generating message in conversation
        const project = store.getProject(projectId)
        const genMsg = project?.messages.find(m => m.jobId === jobId && m.isGenerating)
        if (genMsg) {
          store.updateMessageInProject(projectId, genMsg.id, {
            isGenerating: false,
            content: '视频生成完成',
            videoData: dlData.videoData,
            videoUrl: dlData.videoUrl,
          })
        }

        store.addNotification({ type: 'success', title: '视频生成完成', message: prompt.slice(0, 40), projectId })
        return
      }

      if (data.status === 'failed') {
        store.updateJobInProject(projectId, jobId, { status: 'failed', error: data.error || 'Failed' })
        store.addNotification({ type: 'error', title: '视频生成失败', message: data.error || 'Unknown', projectId })
        return
      }

      if (attempts < maxAttempts) setTimeout(poll, 5000)
      else {
        store.updateJobInProject(projectId, jobId, { status: 'failed', error: 'Timeout' })
        store.addNotification({ type: 'error', title: '视频生成超时', message: '超过 150 秒', projectId })
      }
    } catch (err: any) {
      if (attempts < maxAttempts) setTimeout(poll, 5000)
    }
  }

  setTimeout(poll, 5000)
}
