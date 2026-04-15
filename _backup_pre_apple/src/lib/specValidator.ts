/**
 * Spec Validator — expert-grade asset / spec conformance engine
 * ===========================================================================
 *
 * Why this exists
 * ---------------
 * xu's principle: "尽量减少用户的使用难度，包含重复操作、检索一个固有的行业知识、
 *                  查看已经存在的某些规范，这些部分应该固化到我们的库中。"
 *
 * The asset specs registry (`assetSpecs.ts`) is the固化 part. This file is the
 * detection / explanation / suggestion layer that turns those specs into a
 * usable signal at every stage of the brief flow:
 *
 *   Stage 1 (Intake)   — when xu uploads a reference image, validate it on the
 *                        fly against `targetSpecs` so xu knows BEFORE澄清 whether
 *                        the asset is reusable as-is or needs reshaping.
 *   Stage 2 (Clarify)  — when澄清 picks specs automatically, the validator can
 *                        rule out specs that the existing assets clearly cannot
 *                        satisfy.
 *   Stage 4 (Execute)  — every produced asset is checked against its target
 *                        spec; failures route to a fix-up sub-task instead of
 *                        a final delivery.
 *
 * Design goals (PCEC ADL ranking)
 * -------------------------------
 *   1. STABILITY      — pure deterministic functions, no LLM, no I/O, no Date.now,
 *                       no Math.random. Same input → same output forever.
 *   2. EXPLAINABILITY — every violation carries (severity, code, human message,
 *                       expected vs actual, fix suggestion with numerical math).
 *   3. REUSABILITY    — single library reused by upload route, validate API,
 *                       UI badge, and future Stage 4 pipeline.
 *   4. SCALABILITY    — O(specs × checks) linear, no quadratic surprises. Multi-
 *                       spec validation in one pass shares the work.
 *   5. NOVELTY        — last priority. We do NOT invent new heuristics here;
 *                       every check maps 1:1 to a documented field on AssetSpec.
 *
 * Public surface
 * --------------
 *   - validateAssetAgainstSpec(asset, spec, opts?)   : single spec, full report
 *   - validateAssetAgainstSpecs(asset, specs, opts?) : batch, sorted by score
 *   - findBestFitSpecs(asset, candidates, opts?)     : reverse lookup — given an
 *                                                       asset, which specs fit?
 *   - explainViolation(v)                            : one-line human summary
 *
 * Tolerance modes
 * ---------------
 *   strict   — exact dimensions required; any aspect-ratio drift is a blocker
 *   standard — ±2% aspect tolerance; dimensions within ±10% become warnings
 *   lenient  — ±5% aspect tolerance; dimensions ignored if aspect is right
 *
 * Backwards compatibility
 * -----------------------
 * The legacy `validateAsset()` in `assetSpecs.ts` is kept as a deprecated
 * wrapper that calls into `validateAssetAgainstSpec` and downgrades the result
 * to its original {ok, errors, warnings} shape. ADL says stability > novelty:
 * we never break existing callers.
 */

import type { AssetSpec, SafeZone } from './assetSpecs'

// ─── Public types ───────────────────────────────────────────────────────────

export type Severity = 'blocker' | 'warning' | 'info'

export type ViolationCode =
  | 'media-type-mismatch'
  | 'dimension-mismatch'
  | 'aspect-mismatch'
  | 'orientation-mismatch'
  | 'duration-too-short'
  | 'duration-too-long'
  | 'fps-out-of-range'
  | 'file-size-exceeded'
  | 'format-not-accepted'
  | 'safe-zone-overflow'
  | 'missing-required-field'

export interface Violation {
  code: ViolationCode
  severity: Severity
  /** Concise machine label, e.g. "dimensions" */
  field: string
  /** Human-readable message in Chinese (xu-facing) */
  message: string
  /** What the spec expected, formatted as text */
  expected: string
  /** What we observed, formatted as text */
  actual: string
  /** Optional concrete remediation, e.g. "裁剪到 1080×1920 (中心裁切)" */
  fix?: string
  /** Numeric helper for UI (e.g. crop ratio, percentage off) */
  delta?: number
}

export interface ProducedAsset {
  width: number
  height: number
  /** Detected MIME or extension; we lower-case + strip dot before checking */
  format?: string
  fileSizeMB?: number
  mediaType?: 'image' | 'video'
  /** Video only */
  durationSec?: number
  /** Video only — single number, range collapsed by caller */
  fps?: number
}

export interface ValidationOptions {
  tolerance?: 'strict' | 'standard' | 'lenient'
  /** If true, also check safeZone (informational only) */
  checkSafeZone?: boolean
  /** If true, treat warnings as blockers (used by hard CI gates) */
  warningsAreBlockers?: boolean
}

export interface ValidationReport {
  specId: string
  specName: string
  specNameZh: string
  /** True iff there are no blocker-severity violations (after warningsAreBlockers) */
  ok: boolean
  /** 0-100, higher = better fit. blocker = 0, warning = -10 each, info = -2 each */
  score: number
  /** Summary counts for quick UI rendering */
  blockers: number
  warnings: number
  infos: number
  /** All violations, sorted blocker > warning > info */
  violations: Violation[]
  /** A one-sentence Chinese summary suitable for a chat bubble */
  summary: string
}

export interface BestFitReport {
  asset: ProducedAsset
  candidates: ValidationReport[]
  /** Top-K (default 5) reports where ok === true, sorted by score desc */
  bestFits: ValidationReport[]
  /** Top-K (default 5) closest near-misses (ok === false but score >= 50) */
  nearMisses: ValidationReport[]
}

// ─── Internal helpers ───────────────────────────────────────────────────────

const TOLERANCE_TABLE: Record<
  NonNullable<ValidationOptions['tolerance']>,
  { aspect: number; dimensionPct: number }
> = {
  strict: { aspect: 0.0, dimensionPct: 0.0 },
  standard: { aspect: 0.02, dimensionPct: 0.1 },
  lenient: { aspect: 0.05, dimensionPct: 0.25 },
}

function severityScore(severity: Severity): number {
  if (severity === 'blocker') return -100
  if (severity === 'warning') return -10
  return -2
}

function normalizeFormat(fmt: string | undefined): string | undefined {
  if (!fmt) return undefined
  const f = fmt.toLowerCase().trim()
  // Strip "image/" / "video/" / leading dot
  const slashIdx = f.indexOf('/')
  const tail = slashIdx >= 0 ? f.slice(slashIdx + 1) : f
  return tail.replace(/^\./, '')
}

function ratio(w: number, h: number): number {
  return h === 0 ? 0 : w / h
}

function fitWithinDelta(a: number, b: number, pct: number): boolean {
  if (b === 0) return false
  return Math.abs(a - b) / b <= pct
}

function describeRatio(w: number, h: number): string {
  return `${w}×${h} (${ratio(w, h).toFixed(2)})`
}

function fpsRangeToTuple(fps: AssetSpec['fps']): [number, number] | null {
  if (fps === undefined) return null
  if (typeof fps === 'number') return [fps, fps]
  return fps
}

/**
 * Compute the largest rectangle of a given target aspect ratio that fits
 * inside the source dimensions (center-crop). Returns the suggested crop and
 * the percentage of the source area that survives.
 */
function suggestCenterCrop(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): { cropW: number; cropH: number; areaPctRetained: number } {
  const targetRatio = ratio(targetW, targetH)
  const srcRatio = ratio(srcW, srcH)
  let cropW = srcW
  let cropH = srcH
  if (srcRatio > targetRatio) {
    // Source is too wide → crop horizontally
    cropW = Math.round(srcH * targetRatio)
  } else if (srcRatio < targetRatio) {
    // Source is too tall → crop vertically
    cropH = Math.round(srcW / targetRatio)
  }
  const areaPctRetained = Math.round(((cropW * cropH) / (srcW * srcH)) * 100)
  return { cropW, cropH, areaPctRetained }
}

/**
 * Compute padding needed to fit source into a target canvas WITHOUT cropping.
 * Returns the canvas dims (= target) plus the rendered area.
 */
function suggestLetterbox(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): { canvasW: number; canvasH: number; padPctOfCanvas: number } {
  const targetRatio = ratio(targetW, targetH)
  const srcRatio = ratio(srcW, srcH)
  let renderedW: number
  let renderedH: number
  if (srcRatio > targetRatio) {
    renderedW = targetW
    renderedH = Math.round(targetW / srcRatio)
  } else {
    renderedH = targetH
    renderedW = Math.round(targetH * srcRatio)
  }
  const padPctOfCanvas = Math.round(
    ((targetW * targetH - renderedW * renderedH) / (targetW * targetH)) * 100,
  )
  return { canvasW: targetW, canvasH: targetH, padPctOfCanvas }
}

// ─── Single-spec validation ─────────────────────────────────────────────────

export function validateAssetAgainstSpec(
  asset: ProducedAsset,
  spec: AssetSpec,
  opts: ValidationOptions = {},
): ValidationReport {
  const tol = TOLERANCE_TABLE[opts.tolerance || 'standard']
  const violations: Violation[] = []

  // 1. Media type
  if (asset.mediaType && asset.mediaType !== spec.mediaType) {
    violations.push({
      code: 'media-type-mismatch',
      severity: 'blocker',
      field: 'mediaType',
      message: `素材是 ${asset.mediaType}，规格要求 ${spec.mediaType}`,
      expected: spec.mediaType,
      actual: asset.mediaType,
      fix: `更换为一个 ${spec.mediaType} 类型的素材`,
    })
    // Media type mismatch is fatal — short-circuit further checks would
    // produce noisy nonsense. Return now with maximum penalty.
    return finalizeReport(spec, violations, opts)
  }

  // 2. Dimensions + aspect
  const targetRatio = ratio(spec.width, spec.height)
  const actualRatio = ratio(asset.width, asset.height)
  const exactMatch = asset.width === spec.width && asset.height === spec.height
  const aspectDelta = Math.abs(targetRatio - actualRatio)
  const aspectOk = aspectDelta <= tol.aspect

  if (!exactMatch) {
    if (!aspectOk) {
      // Aspect mismatch → blocker, suggest crop OR pad
      const crop = suggestCenterCrop(asset.width, asset.height, spec.width, spec.height)
      const pad = suggestLetterbox(asset.width, asset.height, spec.width, spec.height)
      violations.push({
        code: 'aspect-mismatch',
        severity: 'blocker',
        field: 'aspectRatio',
        message: `比例不匹配 (${describeRatio(asset.width, asset.height)} vs ${describeRatio(spec.width, spec.height)})`,
        expected: `${spec.aspectRatio} (${spec.width}×${spec.height})`,
        actual: `${actualRatio.toFixed(2)} (${asset.width}×${asset.height})`,
        fix:
          `中心裁切到 ${crop.cropW}×${crop.cropH} 保留 ${crop.areaPctRetained}% 画面，` +
          `或留白到 ${pad.canvasW}×${pad.canvasH}（pad ${pad.padPctOfCanvas}% 区域）`,
        delta: aspectDelta,
      })
    } else {
      // Aspect matches, dimensions don't — needs scaling
      const within = fitWithinDelta(asset.width, spec.width, tol.dimensionPct)
      const upscale = asset.width < spec.width
      violations.push({
        code: 'dimension-mismatch',
        severity: within ? 'info' : 'warning',
        field: 'dimensions',
        message: `尺寸需要${upscale ? '放大' : '缩小'}到目标分辨率`,
        expected: `${spec.width}×${spec.height}`,
        actual: `${asset.width}×${asset.height}`,
        fix: upscale
          ? `等比放大 ×${(spec.width / asset.width).toFixed(2)} 到 ${spec.width}×${spec.height}`
          : `等比缩小 ×${(spec.width / asset.width).toFixed(2)} 到 ${spec.width}×${spec.height}`,
        delta: Math.abs(asset.width - spec.width) / spec.width,
      })
    }
  }

  // 3. Orientation sanity (extra info; some specs are forgiving)
  const targetOrientation = spec.width >= spec.height ? 'landscape' : 'portrait'
  const actualOrientation = asset.width >= asset.height ? 'landscape' : 'portrait'
  if (targetOrientation !== actualOrientation && exactMatch === false) {
    violations.push({
      code: 'orientation-mismatch',
      severity: 'info',
      field: 'orientation',
      message: `朝向不同：素材是${actualOrientation === 'landscape' ? '横向' : '竖向'}，规格是${targetOrientation === 'landscape' ? '横向' : '竖向'}`,
      expected: targetOrientation,
      actual: actualOrientation,
      fix: '按规格朝向重新构图',
    })
  }

  // 4. Duration (video only)
  if (spec.mediaType === 'video') {
    if (asset.durationSec === undefined) {
      violations.push({
        code: 'missing-required-field',
        severity: 'warning',
        field: 'durationSec',
        message: '视频规格需要时长信息但未提供',
        expected: '一个数字（秒）',
        actual: 'undefined',
        fix: '上传时让 ffprobe / 客户端解码补齐 durationSec',
      })
    } else {
      if (spec.minDurationSec !== undefined && asset.durationSec < spec.minDurationSec) {
        violations.push({
          code: 'duration-too-short',
          severity: 'blocker',
          field: 'duration',
          message: `时长 ${asset.durationSec}s 低于规格下限 ${spec.minDurationSec}s`,
          expected: `≥ ${spec.minDurationSec}s`,
          actual: `${asset.durationSec}s`,
          fix: `补足到 ${spec.minDurationSec}s（保留首末帧 / 重复 / 转场）`,
          delta: spec.minDurationSec - asset.durationSec,
        })
      }
      if (spec.maxDurationSec !== undefined && asset.durationSec > spec.maxDurationSec) {
        violations.push({
          code: 'duration-too-long',
          severity: 'blocker',
          field: 'duration',
          message: `时长 ${asset.durationSec}s 超过规格上限 ${spec.maxDurationSec}s`,
          expected: `≤ ${spec.maxDurationSec}s`,
          actual: `${asset.durationSec}s`,
          fix: `裁剪到 ${spec.maxDurationSec}s（建议保留 0-${spec.maxDurationSec}s）`,
          delta: asset.durationSec - spec.maxDurationSec,
        })
      }
    }
  }

  // 5. FPS (video only)
  if (spec.mediaType === 'video' && asset.fps !== undefined) {
    const range = fpsRangeToTuple(spec.fps)
    if (range && (asset.fps < range[0] || asset.fps > range[1])) {
      violations.push({
        code: 'fps-out-of-range',
        severity: 'warning',
        field: 'fps',
        message: `帧率 ${asset.fps} 不在规格范围 [${range[0]}, ${range[1]}]`,
        expected: range[0] === range[1] ? `${range[0]} fps` : `${range[0]}-${range[1]} fps`,
        actual: `${asset.fps} fps`,
        fix: asset.fps > range[1] ? `重采样到 ${range[1]} fps` : `重采样到 ${range[0]} fps`,
      })
    }
  }

  // 6. File size
  if (spec.maxFileSizeMB !== undefined && asset.fileSizeMB !== undefined) {
    if (asset.fileSizeMB > spec.maxFileSizeMB) {
      const overshoot = asset.fileSizeMB - spec.maxFileSizeMB
      const ratio = asset.fileSizeMB / spec.maxFileSizeMB
      violations.push({
        code: 'file-size-exceeded',
        severity: 'blocker',
        field: 'fileSize',
        message: `文件 ${asset.fileSizeMB.toFixed(2)} MB 超过规格上限 ${spec.maxFileSizeMB} MB（超出 ${overshoot.toFixed(2)} MB）`,
        expected: `≤ ${spec.maxFileSizeMB} MB`,
        actual: `${asset.fileSizeMB.toFixed(2)} MB`,
        fix: `按 ${(1 / ratio).toFixed(2)}× 压缩比例 re-encode（参考目标 ≤ ${spec.maxFileSizeMB} MB）`,
        delta: overshoot,
      })
    } else if (asset.fileSizeMB > spec.maxFileSizeMB * 0.9) {
      // Within 10% of cap = info
      violations.push({
        code: 'file-size-exceeded',
        severity: 'info',
        field: 'fileSize',
        message: `文件接近上限（${asset.fileSizeMB.toFixed(2)} / ${spec.maxFileSizeMB} MB）`,
        expected: `≤ ${spec.maxFileSizeMB} MB`,
        actual: `${asset.fileSizeMB.toFixed(2)} MB`,
      })
    }
  }

  // 7. Format
  if (spec.acceptedFormats && spec.acceptedFormats.length > 0) {
    const observed = normalizeFormat(asset.format)
    if (observed && !spec.acceptedFormats.includes(observed)) {
      violations.push({
        code: 'format-not-accepted',
        severity: 'blocker',
        field: 'format',
        message: `格式 "${observed}" 不在规格支持列表`,
        expected: spec.acceptedFormats.join(' / '),
        actual: observed,
        fix: `转码为 ${spec.acceptedFormats[0]}`,
      })
    }
    if (!observed) {
      violations.push({
        code: 'missing-required-field',
        severity: 'info',
        field: 'format',
        message: '未检测到文件格式（无法验证 acceptedFormats）',
        expected: spec.acceptedFormats.join(' / '),
        actual: 'undefined',
      })
    }
  }

  // 8. Safe zone (info-level — we don't know where the content actually is,
  //    but we surface the spec's safe-zone constraints so the UI can render
  //    overlays during preview)
  if (opts.checkSafeZone && spec.safeZone) {
    const sz = spec.safeZone
    violations.push({
      code: 'safe-zone-overflow',
      severity: 'info',
      field: 'safeZone',
      message: '该规格定义了安全区，请确认 CTA / 文字在安全区内',
      expected: formatSafeZone(sz),
      actual: 'unknown (静态校验无法判断像素内容)',
    })
  }

  return finalizeReport(spec, violations, opts)
}

function formatSafeZone(sz: SafeZone): string {
  const parts: string[] = []
  if (sz.top !== undefined) parts.push(`top ${sz.top}%`)
  if (sz.bottom !== undefined) parts.push(`bottom ${sz.bottom}%`)
  if (sz.left !== undefined) parts.push(`left ${sz.left}%`)
  if (sz.right !== undefined) parts.push(`right ${sz.right}%`)
  return parts.length ? parts.join(' / ') : '未配置'
}

function finalizeReport(
  spec: AssetSpec,
  rawViolations: Violation[],
  opts: ValidationOptions,
): ValidationReport {
  // Optionally promote warnings to blockers
  const violations: Violation[] = opts.warningsAreBlockers
    ? rawViolations.map((v) =>
        v.severity === 'warning' ? { ...v, severity: 'blocker' as const } : v,
      )
    : rawViolations

  violations.sort((a, b) => {
    const rank = { blocker: 0, warning: 1, info: 2 }
    return rank[a.severity] - rank[b.severity]
  })

  let score = 100
  let blockers = 0
  let warnings = 0
  let infos = 0
  for (const v of violations) {
    score += severityScore(v.severity)
    if (v.severity === 'blocker') blockers++
    else if (v.severity === 'warning') warnings++
    else infos++
  }
  score = Math.max(0, Math.min(100, score))

  const ok = blockers === 0
  let summary: string
  if (ok && warnings === 0 && infos === 0) {
    summary = `✓ 完全符合 ${spec.nameZh}`
  } else if (ok && warnings === 0) {
    summary = `✓ 符合 ${spec.nameZh}（${infos} 条提示）`
  } else if (ok) {
    summary = `△ 符合 ${spec.nameZh}（${warnings} 条警告 / ${infos} 条提示）`
  } else {
    summary = `✗ 不符合 ${spec.nameZh}（${blockers} 条阻塞 / ${warnings} 条警告）`
  }

  return {
    specId: spec.id,
    specName: spec.name,
    specNameZh: spec.nameZh,
    ok,
    score,
    blockers,
    warnings,
    infos,
    violations,
    summary,
  }
}

// ─── Multi-spec validation ──────────────────────────────────────────────────

export function validateAssetAgainstSpecs(
  asset: ProducedAsset,
  specs: AssetSpec[],
  opts: ValidationOptions = {},
): ValidationReport[] {
  return specs
    .map((s) => validateAssetAgainstSpec(asset, s, opts))
    .sort((a, b) => b.score - a.score)
}

// ─── Reverse lookup: best-fit specs ─────────────────────────────────────────

export interface BestFitOptions extends ValidationOptions {
  /** Top-K perfect fits to return */
  fitLimit?: number
  /** Top-K near-misses to return */
  nearMissLimit?: number
  /** Score floor for near-misses (out of 100) */
  nearMissThreshold?: number
}

export function findBestFitSpecs(
  asset: ProducedAsset,
  candidates: AssetSpec[],
  opts: BestFitOptions = {},
): BestFitReport {
  const fitLimit = opts.fitLimit ?? 5
  const nearMissLimit = opts.nearMissLimit ?? 5
  const nearMissThreshold = opts.nearMissThreshold ?? 50

  const reports = validateAssetAgainstSpecs(asset, candidates, opts)
  const bestFits = reports.filter((r) => r.ok).slice(0, fitLimit)
  const nearMisses = reports
    .filter((r) => !r.ok && r.score >= nearMissThreshold)
    .slice(0, nearMissLimit)

  return { asset, candidates: reports, bestFits, nearMisses }
}

// ─── Single-line explainer (UI helper) ──────────────────────────────────────

export function explainViolation(v: Violation): string {
  const icon = v.severity === 'blocker' ? '✗' : v.severity === 'warning' ? '△' : 'ℹ'
  const fix = v.fix ? ` → ${v.fix}` : ''
  return `${icon} ${v.message}${fix}`
}
