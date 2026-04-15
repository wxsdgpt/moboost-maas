/**
 * Brief Schema — shared types for the 4-stage progressive brief flow.
 *
 * Stage 1  Intake     → RawIntake
 * Stage 2  Clarify    → ClarifiedBrief
 * Stage 3  Enrich     → EnrichedBrief
 * Stage 4  Execute    → ExecutableBrief
 *
 * Each stage extends the previous one. The UI / APIs serialize the in-flight
 * brief between stages so the user can pause, resume, or jump back.
 */

// ─── Shared sub-types ──────────────────────────────────────────────────────

export interface UploadedAssetValidation {
  /** Spec id this asset was checked against */
  specId: string
  /** Mirror of ValidationReport.score (0-100) */
  score: number
  ok: boolean
  blockers: number
  warnings: number
  infos: number
  /** Chinese 1-line summary, suitable for chat / badge tooltip */
  summary: string
}

export interface UploadedAsset {
  /** Stable id within this brief */
  id: string
  /** Local URL or remote URL where the file lives */
  url: string
  /** MIME type, e.g. "image/png", "video/mp4" */
  mime: string
  /** Original filename, optional */
  filename?: string
  /** Bytes */
  size?: number
  /** Image-only */
  width?: number
  height?: number
  /** Video-only — seconds */
  durationSec?: number
  /** Video-only — frames per second (float, e.g. 29.97) */
  fps?: number
  /** Video-only — first sample entry fourcc (avc1 / hvc1 / av01 / vp09 …) */
  codec?: string
  /** Free-text caption from upload form */
  caption?: string
  /**
   * If the upload pipeline ran spec-validation against one or more
   * `targetSpecs`, the per-spec verdict lives here. The first entry is the
   * highest-scoring fit, sorted descending. Older callers can ignore this
   * field — it is fully optional and additive (ADL: stability > novelty).
   */
  validations?: UploadedAssetValidation[]
}

// ─── Stage 1: Raw intake ───────────────────────────────────────────────────

export interface RawIntake {
  id: string
  /** Free-text description (the chat-like box) */
  text?: string
  /** Reference URLs (competitor pages, inspiration links) */
  urls?: string[]
  /** Uploaded images / videos / generic files */
  images?: UploadedAsset[]
  videos?: UploadedAsset[]
  files?: UploadedAsset[]
  /** Pre-selected asset specs (AssetSpec.id values) */
  targetSpecs: string[]
  /** User clicked "let AI pick the spec" — Stage 2 will infer it */
  specAutoDetect: boolean
  createdAt: number
}

// ─── Stage 2: Clarify ──────────────────────────────────────────────────────

export type PageType = 'product' | 'landing' | 'article' | 'social' | 'unknown'

export interface ParsedReference {
  url: string
  pageType: PageType
  /** Hero/banner/video/copy detected from the page */
  extractedAssets: {
    heroImage?: string
    banners?: string[]
    videos?: string[]
    copy?: { title?: string; body?: string }
  }
}

export interface ClarificationQuestion {
  /** Stable id so the UI can track answered/unanswered state */
  id: string
  /** Field this question fills in (e.g. "audience", "tone", "duration") */
  field: string
  /** Human-readable question text in Chinese */
  question: string
  /** Optional preset choices to render as chips */
  choices?: string[]
  /** Marked as required for the brief to advance */
  required: boolean
}

export interface ClarifiedBrief extends RawIntake {
  parsedRefs: ParsedReference[]
  /** Same as RawIntake.targetSpecs but auto-filled if specAutoDetect was true */
  targetSpecs: string[]
  /** Clarification questions the AI still needs answered before we can enrich */
  pendingQuestions: ClarificationQuestion[]
  /** Field → user answer pairs collected so far */
  answers: Record<string, string>
}

// ─── Stage 3: Enrich (placeholder, finalized later) ────────────────────────

export interface AudienceSegment {
  geo?: string[]
  ageRange?: [number, number]
  gender?: 'all' | 'male' | 'female'
  interests?: string[]
}

export interface EnrichedBrief extends ClarifiedBrief {
  item?: { product: string; vertical: string; brandColors?: string[]; tone?: string }
  user?: { audience: AudienceSegment; geos?: string[]; language?: string }
  context?: { temporal?: string[]; spatial?: string[]; zeitgeist?: string[] }
  rejectedSuggestions?: string[]
}

// ─── Stage 4: Execute (placeholder) ────────────────────────────────────────

export type Pipeline = 'auto' | 'T2I' | 'I2I' | 'T2V' | 'I2V' | 'V2V' | 'page-compose'

export interface SubTask {
  id: string
  pipeline: Pipeline
  targetSpecId: string
  prompt: string
}

export interface ExecutableBrief extends EnrichedBrief {
  pipeline: Pipeline
  subTasks?: SubTask[]
}
