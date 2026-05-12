/**
 * E2E Simulation Test — 模拟用户操作的完整链路测试
 * 
 * 无需浏览器，直接验证 store + 逻辑层的端到端行为。
 * 模拟 UnifiedCollector → store → ProjectWorkspace 的完整流程。
 *
 * Run: npx tsx src/lib/__tests__/e2e-simulation.test.ts
 */

// ──── Mock store (simplified, mirrors real store API) ────

interface ChatMessage {
  id: string; role: 'user' | 'assistant'; content: string; timestamp: string
  jobId?: string; imageData?: string; isGenerating?: boolean; error?: string
}

interface GenerationJob {
  id: string; projectId: string; type: 'image' | 'video'; prompt: string
  status: 'routing' | 'generating' | 'evaluating' | 'completed' | 'failed'
  createdAt: string; thinkingSteps: { id: string; label: string; detail: string; status: string; timestamp: string }[]
}

interface GeneratedAsset {
  id: string; jobId: string; type: 'image' | 'video'; prompt: string; createdAt: string
  imageData?: string; videoData?: string
}

interface ProjectRecord {
  id: string; name: string; createdAt: string
  jobs: GenerationJob[]; messages: ChatMessage[]; assets: GeneratedAsset[]
  selectedAssetId: string | null; status: 'active' | 'archived'
}

let projects: ProjectRecord[] = []

const mockStore = {
  createProject(name: string, firstMessage?: ChatMessage): ProjectRecord {
    const project: ProjectRecord = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name, createdAt: new Date().toISOString(),
      jobs: [], messages: firstMessage ? [firstMessage] : [],
      assets: [], selectedAssetId: null, status: 'active',
    }
    projects.unshift(project)
    return project
  },
  addJobToProject(projectId: string, job: GenerationJob) {
    const p = projects.find(p => p.id === projectId)
    if (p) p.jobs.push(job)
  },
  addMessageToProject(projectId: string, msg: ChatMessage) {
    const p = projects.find(p => p.id === projectId)
    if (p) p.messages.push(msg)
  },
  addAssetToProject(projectId: string, asset: GeneratedAsset) {
    const p = projects.find(p => p.id === projectId)
    if (p) { p.assets.push(asset); p.selectedAssetId = asset.id }
  },
  updateJobInProject(projectId: string, jobId: string, updates: Partial<GenerationJob>) {
    const p = projects.find(p => p.id === projectId)
    if (p) {
      const j = p.jobs.find(j => j.id === jobId)
      if (j) Object.assign(j, updates)
    }
  },
  getProject(id: string) { return projects.find(p => p.id === id) },
  getProjects() { return projects },
  reset() { projects = [] },
}

// ──── Pure functions from UnifiedCollector ────

type Intent = 'intel' | 'asset' | 'landing' | 'pipeline' | null
type ChatMsg = { role: 'user' | 'assistant'; content: string }

const NUMBERED_INTENT_MAP: Record<string, Intent> = { '1': 'intel', '2': 'asset', '3': 'landing', '4': 'pipeline' }
const QUICK_REPLY_REGEX = /^([1-4])[.、)）\s]?/

function hasNumberedOptions(msgs: ChatMsg[]): boolean {
  const last = [...msgs].reverse().find(m => m.role === 'assistant')
  if (!last) return false
  return /[1-4][)）.、]/.test(last.content)
}

function tryQuickReplyMap(text: string, msgs: ChatMsg[]): Intent {
  if (!hasNumberedOptions(msgs)) return null
  const match = text.match(QUICK_REPLY_REGEX)
  if (!match) return null
  return NUMBERED_INTENT_MAP[match[1]] || null
}

function detectAssetType(text: string): 'image' | 'video' {
  const lower = text.toLowerCase()
  const videoPatterns = [/视频/, /video/, /\bclip\b/, /动画/, /\banimation\b/, /\bmotion\b/, /\bveo\b/, /短片/]
  return videoPatterns.some(p => p.test(lower)) ? 'video' : 'image'
}

function generateThinkingSteps(type: 'image' | 'video', prompt: string) {
  const now = () => new Date().toISOString()
  return [
    { id: 's1', label: '解析用户意图', detail: `类型: ${type}`, status: 'pending', timestamp: now() },
    { id: 's2', label: 'Model Router', detail: '选择引擎', status: 'pending', timestamp: now() },
    { id: 's3', label: '生成', detail: prompt.slice(0, 30), status: 'pending', timestamp: now() },
  ]
}

// ──── Simulate executeIntent (asset path) ────

function simulateExecuteIntent(intent: string, userInput: string): { projectId: string; hasJob: boolean } {
  const hasPrompt = !!userInput.trim()
  const projectName = hasPrompt
    ? userInput.slice(0, 40) + (userInput.length > 40 ? '...' : '')
    : `${intent} project`

  if (intent === 'asset') {
    const project = hasPrompt
      ? mockStore.createProject(projectName, {
          id: `msg-${Date.now()}`, role: 'user', content: userInput, timestamp: new Date().toISOString(),
        })
      : mockStore.createProject(projectName)

    if (hasPrompt) {
      const assetType = detectAssetType(userInput)
      const steps = generateThinkingSteps(assetType, userInput)
      const job: GenerationJob = {
        id: `job-${Date.now()}`, projectId: project.id, type: assetType,
        prompt: userInput, status: 'routing', createdAt: new Date().toISOString(), thinkingSteps: steps,
      }
      mockStore.addJobToProject(project.id, job)
    }

    return { projectId: project.id, hasJob: hasPrompt }
  }

  return { projectId: '', hasJob: false }
}

// ──── Simulate ProjectWorkspace auto-start ────

function simulateProjectWorkspaceAutoStart(projectId: string): {
  autoStarted: boolean; jobId: string | null; jobType: string | null; prompt: string | null
} {
  const project = mockStore.getProject(projectId)
  if (!project) return { autoStarted: false, jobId: null, jobType: null, prompt: null }

  const pendingJob = project.jobs.find(j => j.status === 'routing')
  if (!pendingJob) return { autoStarted: false, jobId: null, jobType: null, prompt: null }

  // Mark as generating (simulates ModelRouter completion)
  mockStore.updateJobInProject(projectId, pendingJob.id, { status: 'generating' })

  return {
    autoStarted: true,
    jobId: pendingJob.id,
    jobType: pendingJob.type,
    prompt: pendingJob.prompt,
  }
}

// ──── Simulate generation complete ────

function simulateGenerationComplete(projectId: string, jobId: string) {
  const project = mockStore.getProject(projectId)
  if (!project) return
  const job = project.jobs.find(j => j.id === jobId)
  if (!job) return

  mockStore.updateJobInProject(projectId, jobId, { status: 'completed' })
  mockStore.addAssetToProject(projectId, {
    id: `asset-${Date.now()}`, jobId, type: job.type,
    prompt: job.prompt, createdAt: new Date().toISOString(),
    imageData: job.type === 'image' ? 'data:image/png;base64,fake' : undefined,
    videoData: job.type === 'video' ? 'data:video/mp4;base64,fake' : undefined,
  })
}

// ──── Test runner ────

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ ${msg}`) }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ ${msg} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`) }
}

// ──── Scenario 1: 直接输入明确 prompt (路径 A) ────

console.log('\n=== 场景 1: 直接输入明确 asset prompt ===')
mockStore.reset()

const s1Input = '生成一张体育博彩的广告banner'
const s1Type = detectAssetType(s1Input)
assertEqual(s1Type, 'image', 'detectAssetType → image')

const s1 = simulateExecuteIntent('asset', s1Input)
assert(!!s1.projectId, '项目已创建')
assert(s1.hasJob, '有 routing job')

const s1Project = mockStore.getProject(s1.projectId)!
assertEqual(s1Project.messages.length, 1, '项目有 1 条 user 消息')
assertEqual(s1Project.messages[0].content, s1Input, '消息内容是原始 prompt')
assertEqual(s1Project.jobs.length, 1, '项目有 1 个 job')
assertEqual(s1Project.jobs[0].status, 'routing', 'job 状态是 routing')
assertEqual(s1Project.jobs[0].type, 'image', 'job 类型是 image')
assertEqual(s1Project.jobs[0].prompt, s1Input, 'job prompt 是原始输入')

// Simulate ProjectWorkspace auto-start
const s1Auto = simulateProjectWorkspaceAutoStart(s1.projectId)
assert(s1Auto.autoStarted, 'ProjectWorkspace auto-start 触发')
assertEqual(s1Auto.jobType, 'image', 'auto-start 类型是 image')
assertEqual(s1Auto.prompt, s1Input, 'auto-start prompt 正确')

// Simulate generation complete
simulateGenerationComplete(s1.projectId, s1Auto.jobId!)
const s1Final = mockStore.getProject(s1.projectId)!
assertEqual(s1Final.jobs[0].status, 'completed', 'job 最终 completed')
assertEqual(s1Final.assets.length, 1, '有 1 个生成资产')
assertEqual(s1Final.assets[0].type, 'image', '资产类型是 image')
assert(!!s1Final.selectedAssetId, '有选中的资产（画布显示）')


// ──── Scenario 2: 视频生成 (路径 G) ────

console.log('\n=== 场景 2: 视频类型检测 + 生成 ===')
mockStore.reset()

const s2Input = '生成一个赌场广告视频'
assertEqual(detectAssetType(s2Input), 'video', 'detectAssetType → video')

const s2 = simulateExecuteIntent('asset', s2Input)
const s2Project = mockStore.getProject(s2.projectId)!
assertEqual(s2Project.jobs[0].type, 'video', 'job 类型是 video')

const s2Auto = simulateProjectWorkspaceAutoStart(s2.projectId)
assert(s2Auto.autoStarted, 'auto-start 触发')
assertEqual(s2Auto.jobType, 'video', 'auto-start 类型是 video')

simulateGenerationComplete(s2.projectId, s2Auto.jobId!)
const s2Final = mockStore.getProject(s2.projectId)!
assertEqual(s2Final.assets[0].type, 'video', '资产类型是 video')


// ──── Scenario 3: 澄清 → 数字快速回复 (路径 C1, 有原始内容) ────

console.log('\n=== 场景 3: chatMode 澄清 → 回复 "2"（有原始内容）===')
mockStore.reset()

// 模拟对话历史
const s3Msgs: ChatMsg[] = [
  { role: 'user', content: '帮我做个广告' },
  { role: 'assistant', content: '请问您想要：1) 生成竞品情报报告 2) 生成营销素材（图片/视频）3) 生成落地页 4) 全套一键联动？' },
  { role: 'user', content: '2' },
]

// 快路径映射
const s3Intent = tryQuickReplyMap('2', s3Msgs)
assertEqual(s3Intent, 'asset', '快路径映射 → asset')

// 提取原始 prompt
const s3Original = s3Msgs.find(m => m.role === 'user')!.content
const s3IsVague = /^[0-9\s.、)）]+$/.test(s3Original.trim())
assertEqual(s3IsVague, false, '原始输入 "帮我做个广告" 不是模糊的')

// 用原始 prompt 执行
const s3 = simulateExecuteIntent('asset', s3Original)
const s3Project = mockStore.getProject(s3.projectId)!
assertEqual(s3Project.jobs[0].prompt, '帮我做个广告', 'job prompt 是原始输入，不是 "2"')
assert(s3.hasJob, '有 routing job（自动生成）')

const s3Auto = simulateProjectWorkspaceAutoStart(s3.projectId)
assert(s3Auto.autoStarted, 'auto-start 触发')
assertEqual(s3Auto.prompt, '帮我做个广告', 'auto-start prompt 是原始输入')


// ──── Scenario 4: 澄清 → 数字回复（无原始内容）(路径 C2) ────

console.log('\n=== 场景 4: chatMode → 回复 "2"（原始也是数字）===')
mockStore.reset()

const s4Msgs: ChatMsg[] = [
  { role: 'assistant', content: '请问您想要：1) 情报 2) 素材 3) 落地页 4) 一键联动？' },
  { role: 'user', content: '2' },
]

const s4Intent = tryQuickReplyMap('2', s4Msgs)
assertEqual(s4Intent, 'asset', '快路径映射 → asset')

// 无原始用户消息（第一条就是 assistant）
const s4Original = s4Msgs.find(m => m.role === 'user')
const s4OriginalContent = s4Original?.content || ''
const s4IsVague = !s4OriginalContent || /^[0-9\s.、)）]+$/.test(s4OriginalContent.trim())
assertEqual(s4IsVague, true, '"2" 是模糊的，不应自动生成')

// 用空 prompt 执行
const s4 = simulateExecuteIntent('asset', '')
const s4Project = mockStore.getProject(s4.projectId)!
assertEqual(s4Project.jobs.length, 0, '无 routing job（不自动生成）')
assertEqual(s4Project.messages.length, 0, '无用户消息（空 prompt）')
assertEqual(s4Project.name, 'asset project', '项目名称用默认值')

// ProjectWorkspace 不会 auto-start
const s4Auto = simulateProjectWorkspaceAutoStart(s4.projectId)
assertEqual(s4Auto.autoStarted, false, 'auto-start 未触发（等待用户输入）')


// ──── Scenario 5: Quick Action 选择 (路径 B) ────

console.log('\n=== 场景 5: Quick Action "asset" + 输入 prompt ===')
mockStore.reset()

// explicitIntent=asset 时 confidence=1.0，直接执行
const s5Input = 'casino welcome bonus banner'
const s5 = simulateExecuteIntent('asset', s5Input)
assert(s5.hasJob, '有 routing job')
const s5Project = mockStore.getProject(s5.projectId)!
assertEqual(s5Project.jobs[0].prompt, s5Input, 'prompt 正确')
assertEqual(s5Project.jobs[0].type, 'image', '类型是 image')


// ──── Scenario 6: 生成后资产可编辑 (路径 E-07) ────

console.log('\n=== 场景 6: 生成完成后资产在项目中可访问 ===')
mockStore.reset()

const s6 = simulateExecuteIntent('asset', '高转化体育博彩banner 1200x628')
simulateProjectWorkspaceAutoStart(s6.projectId)
simulateGenerationComplete(s6.projectId, mockStore.getProject(s6.projectId)!.jobs[0].id)

const s6Project = mockStore.getProject(s6.projectId)!
assertEqual(s6Project.assets.length, 1, '有 1 个资产')
assert(!!s6Project.selectedAssetId, '资产被自动选中')
assertEqual(s6Project.assets[0].id, s6Project.selectedAssetId, 'selectedAssetId 指向生成的资产')
assert(!!s6Project.assets[0].imageData, '资产有 imageData（可在画布显示）')
assertEqual(s6Project.assets[0].prompt, '高转化体育博彩banner 1200x628', '资产携带原始 prompt')


// ──── Scenario 7: 多次生成，资产累积 ────

console.log('\n=== 场景 7: 连续生成多个资产 ===')
// 继续在 s6 的项目上生成第二个
const s7JobId = `job-${Date.now() + 1}`
mockStore.addJobToProject(s6.projectId, {
  id: s7JobId, projectId: s6.projectId, type: 'video',
  prompt: '赌场视频广告 30s', status: 'routing',
  createdAt: new Date().toISOString(),
  thinkingSteps: generateThinkingSteps('video', '赌场视频广告 30s'),
})
mockStore.updateJobInProject(s6.projectId, s7JobId, { status: 'generating' })
simulateGenerationComplete(s6.projectId, s7JobId)

const s7Project = mockStore.getProject(s6.projectId)!
assertEqual(s7Project.assets.length, 2, '项目有 2 个资产')
assertEqual(s7Project.assets[0].type, 'image', '第 1 个是 image')
assertEqual(s7Project.assets[1].type, 'video', '第 2 个是 video')
assertEqual(s7Project.selectedAssetId, s7Project.assets[1].id, '最新资产被选中')


// ──── Scenario 8: word-boundary 回归测试 ────

console.log('\n=== 场景 8: detectAssetType word-boundary 回归 ===')

assertEqual(detectAssetType('promotional poster for casino'), 'image', 'promotional 不误匹配 motion → image')
assertEqual(detectAssetType('create a motion graphics ad'), 'video', 'motion (独立词) → video')
assertEqual(detectAssetType('emotional banner design'), 'image', 'emotional 不误匹配 motion → image')
assertEqual(detectAssetType('locomotion study video'), 'video', '虽含 locomotion 但也含 video → video')


// ──── Summary ────

console.log(`\n${'='.repeat(50)}`)
console.log(`E2E Simulation: ${passed + failed} total | ${passed} passed | ${failed} failed`)
console.log(`${'='.repeat(50)}\n`)

process.exit(failed > 0 ? 1 : 0)
