// ========== Project ==========
export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  modules: ProjectModules
  status: 'active' | 'archived'
}

export interface ProjectModules {
  intel?: IntelModule       // 情报报告
  brief?: BriefModule       // Brief
  assets?: AssetsModule     // 素材
  landing?: LandingModule   // 落地页
}

export interface IntelModule {
  query: string
  results: IntelResult[]
  createdAt: string
}

export interface IntelResult {
  title: string
  source: string
  summary: string
  category: 'competitor' | 'industry' | 'regulation' | 'tech'
}

export interface BriefModule {
  input: string
  structured: StructuredBrief | null
  createdAt: string
}

export interface StructuredBrief {
  objective: string
  targetAudience: string
  keyMessage: string
  tone: string
  channels: string[]
  dimensions: AssetDimension[]
  references: string[]
}

export interface AssetDimension {
  width: number
  height: number
  label: string  // e.g. "Facebook Feed", "Instagram Story"
}

export interface AssetsModule {
  items: Asset[]
}

export interface Asset {
  id: string
  type: 'image' | 'video'
  url: string
  prompt: string
  model: string
  evaluation: AssetEvaluation | null
  createdAt: string
  status: 'generating' | 'evaluating' | 'approved' | 'rejected'
}

export interface AssetEvaluation {
  d1_spec: { score: number; details: string }      // 规格合规
  d2_content: { score: number; details: string }    // 内容完整性
  d3_expression: { score: number; details: string } // 表达力
  d4_competitive: { score: number; details: string }// 竞争优势
  overall: number
  suggestion: string
}

export interface LandingModule {
  template: string
  html: string | null
  harnessConfig: HarnessConfig
  status: 'draft' | 'generated' | 'approved'
}

export interface HarnessConfig {
  must: HarnessRule[]
  mustNot: HarnessRule[]
  creative: HarnessRule[]
}

export interface HarnessRule {
  type: string
  description: string
  constraint?: string
}

// ========== Chat / Generation ==========
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    type?: 'text' | 'image' | 'video' | 'intel' | 'brief' | 'landing' | 'evaluation'
    projectId?: string
    assetUrl?: string
    evaluation?: AssetEvaluation
  }
}

// ========== Model Router (Fake for V1) ==========
export interface ModelCandidate {
  id: string
  name: string
  type: 'image' | 'video' | 'text'
  matchScore: number  // 0-100, fake for V1
  speed: string
  quality: string
  cost: string
}

// ========== Agent Evolution ==========
export interface UserProfile {
  preferences: Record<string, string>
  styleHistory: string[]
  feedbackSummary: string
  lastUpdated: string
}

// ========== Quick Actions ==========
export type QuickAction = 'pipeline' | 'generate_asset' | 'intel_only' | 'generate_landing'
