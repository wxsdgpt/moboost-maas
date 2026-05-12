/**
 * Context Configuration — tuneable parameters for prompt context assembly.
 *
 * Defaults are sensible for iGaming marketing generation.
 * Can be overridden via /admin/config or per-request.
 *
 * Used by: contextBuilder.ts
 */

export interface ContextConfig {
  /** Max number of conversation history messages to include (0 = none) */
  maxContextMessages: number
  /** Max total characters for the assembled prompt (rough token estimate) */
  maxContextChars: number
  /** Whether to include summaries of previously generated assets */
  includeAssetSummary: boolean
  /** Whether to include D1-D4 evaluation feedback in asset summaries */
  includeEvaluationFeedback: boolean
}

const DEFAULTS: ContextConfig = {
  maxContextMessages: 10,
  maxContextChars: 8000,
  includeAssetSummary: true,
  includeEvaluationFeedback: true,
}

// Runtime override (set via admin panel or API)
let _overrides: Partial<ContextConfig> = {}

/** Get the effective context config (defaults merged with overrides) */
export function getContextConfig(): ContextConfig {
  return { ...DEFAULTS, ..._overrides }
}

/** Update context config at runtime (e.g., from admin panel) */
export function setContextConfig(overrides: Partial<ContextConfig>): void {
  _overrides = { ...overrides }
}

/** Reset to defaults */
export function resetContextConfig(): void {
  _overrides = {}
}

/** Export defaults for tests and documentation */
export const CONTEXT_DEFAULTS = DEFAULTS
