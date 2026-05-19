// src/lib/workflowTypes.ts
// 工作流编辑器 — 类型定义
// Phase 2 设计确认，V1 核心 7 种节点

// ===== 节点类型 =====
export type WorkflowNodeType =
  | 'script_input'
  | 'storyboard_gen'
  | 'prompt_gen'
  | 'image_gen'
  | 'video_gen'
  | 'batch_split'
  | 'batch_merge'
  // V2
  | 'character_extract'
  | 'scene_extract'
  | 'tts_gen'
  | 'video_merge'
  | 'human_review';

export const V1_NODE_TYPES: WorkflowNodeType[] = [
  'script_input', 'storyboard_gen', 'prompt_gen',
  'image_gen', 'video_gen', 'batch_split', 'batch_merge',
];

// ===== 节点元数据 =====
export interface NodeMeta {
  type: WorkflowNodeType;
  label: string;
  icon: string;
  color: string;
  description: string;
  inputs: string[];
  outputs: string[];
  creditCost: number;
  v1: boolean;
}

export const NODE_REGISTRY: Record<WorkflowNodeType, NodeMeta> = {
  script_input: {
    type: 'script_input', label: '剧本输入', icon: '📝', color: '#6366f1',
    description: '输入或上传剧本/文案', inputs: [], outputs: ['text'],
    creditCost: 0, v1: true,
  },
  storyboard_gen: {
    type: 'storyboard_gen', label: '分镜生成', icon: '🎬', color: '#8b5cf6',
    description: 'AI 自动将剧本拆解为结构化分镜', inputs: ['text'], outputs: ['storyboard'],
    creditCost: 5, v1: true,
  },
  prompt_gen: {
    type: 'prompt_gen', label: '提示词生成', icon: '✏️', color: '#a78bfa',
    description: '为每个分镜生成图片/视频提示词', inputs: ['storyboard', 'images?'], outputs: ['prompts'],
    creditCost: 3, v1: true,
  },
  image_gen: {
    type: 'image_gen', label: '图片生成', icon: '🖼️', color: '#f59e0b',
    description: '根据提示词生成图片', inputs: ['prompt', 'referenceImage?'], outputs: ['image'],
    creditCost: 10, v1: true,
  },
  video_gen: {
    type: 'video_gen', label: '视频生成', icon: '🎥', color: '#ef4444',
    description: '图片+提示词生成视频片段', inputs: ['image', 'prompt'], outputs: ['video'],
    creditCost: 30, v1: true,
  },
  batch_split: {
    type: 'batch_split', label: '批量拆分', icon: '🔀', color: '#06b6d4',
    description: '将分镜表拆分为并行分支', inputs: ['storyboard'], outputs: ['items'],
    creditCost: 0, v1: true,
  },
  batch_merge: {
    type: 'batch_merge', label: '批量合并', icon: '🔄', color: '#06b6d4',
    description: '汇聚并行分支的结果', inputs: ['items'], outputs: ['collection'],
    creditCost: 0, v1: true,
  },
  // V2 节点
  character_extract: {
    type: 'character_extract', label: '角色提取', icon: '🎭', color: '#ec4899',
    description: 'AI 从剧本中提取角色', inputs: ['text'], outputs: ['characters'],
    creditCost: 3, v1: false,
  },
  scene_extract: {
    type: 'scene_extract', label: '场景提取', icon: '🏞️', color: '#10b981',
    description: 'AI 从剧本中提取场景', inputs: ['text'], outputs: ['scenes'],
    creditCost: 3, v1: false,
  },
  tts_gen: {
    type: 'tts_gen', label: 'TTS 配音', icon: '🔊', color: '#f97316',
    description: '文字转语音配音', inputs: ['text', 'voiceId?'], outputs: ['audio'],
    creditCost: 8, v1: false,
  },
  video_merge: {
    type: 'video_merge', label: '视频拼接', icon: '✂️', color: '#14b8a6',
    description: 'FFmpeg 拼接视频+配音+字幕', inputs: ['videos', 'audio?'], outputs: ['video'],
    creditCost: 5, v1: false,
  },
  human_review: {
    type: 'human_review', label: '人工审批', icon: '👁️', color: '#64748b',
    description: '暂停等待人工审核', inputs: ['any'], outputs: ['any'],
    creditCost: 0, v1: false,
  },
};

// ===== 节点配置 =====
export interface ScriptInputConfig {
  source: 'text' | 'file';
  content?: string;
}

export interface StoryboardGenConfig {
  maxScenes: number;
  style: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

export interface PromptGenConfig {
  dictionary: 'jurilu' | 'chushou' | 'custom';
  templateId?: string;
}

export interface ImageGenConfig {
  model: string;
  width: number;
  height: number;
  count: number;
  negativePrompt?: string;
  seed?: number;
}

export interface VideoGenConfig {
  model: string;
  duration: number;
  useFirstFrame: boolean;
  useLastFrame: boolean;
}

export type NodeConfig = {
  label: string;
  maxRetries?: number;
} & Partial<{
  scriptInput: ScriptInputConfig;
  storyboardGen: StoryboardGenConfig;
  promptGen: PromptGenConfig;
  imageGen: ImageGenConfig;
  videoGen: VideoGenConfig;
}>;

// ===== 分镜数据结构 =====
export interface Storyboard {
  id: string;
  title: string;
  scenes: Scene[];
  characters: Character[];
  settings: StoryboardSettings;
}

export interface Scene {
  order: number;
  description: string;
  dialogue?: string;
  camera: CameraSpec;
  characterIds: string[];
  emotion: string;
  duration: number;
  referenceImageUrl?: string;
  endFrameImageUrl?: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  referenceImageUrls: string[];
}

export interface CameraSpec {
  shot: string;
  angle: string;
  movement: string;
  composition: string;
}

export interface StoryboardSettings {
  style: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  targetDuration: number;
}

// ===== 工作流图 =====
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: { config: NodeConfig };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// ===== 工作流实体 =====
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  graph: WorkflowGraph;
  templateKey?: string;
  isTemplate: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ===== 积分预估 =====
export interface CreditEstimate {
  total: number;
  breakdown: CreditBreakdownItem[];
}

export interface CreditBreakdownItem {
  nodeId: string;
  nodeType: WorkflowNodeType;
  label: string;
  credits: number;
  model?: string;
  multiplier?: number;
}

// ===== 工作流运行 =====
export type RunStatus = 'pending' | 'estimating' | 'awaiting_confirm' | 'running' | 'completed' | 'failed' | 'cancelled';
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: RunStatus;
  progress: number;
  estimatedCredits?: number;
  creditsConsumed: number;
  nodeStatuses: Record<string, NodeExecutionStatus>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: string;
}

export interface NodeExecutionStatus {
  nodeId: string;
  status: NodeStatus;
  progress?: number;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// ===== SSE 事件 =====
export type WorkflowSSEEvent =
  | { type: 'progress'; runId: string; progress: number; nodeStatuses: Record<string, NodeExecutionStatus> }
  | { type: 'node_start'; runId: string; nodeId: string }
  | { type: 'node_complete'; runId: string; nodeId: string; output: unknown }
  | { type: 'node_error'; runId: string; nodeId: string; error: string }
  | { type: 'run_complete'; runId: string; output: Record<string, unknown> }
  | { type: 'run_error'; runId: string; error: string };
