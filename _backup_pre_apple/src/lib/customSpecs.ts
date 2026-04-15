/**
 * Customer-defined Asset Specs
 * ---------------------------------------------------------------------------
 * On top of the global `ASSET_SPECS` catalog in `./assetSpecs.ts`, each
 * customer (tenant) can define their own specs. Typical use cases:
 *
 *   - A casino brand has a proprietary "Promo Popup" at 720x960 that maps to
 *     no standard IAB size
 *   - A sportsbook needs a bespoke "Match Card" at 1080x540 embedded in their
 *     app
 *   - An affiliate partner ships a weird 468x60 legacy banner that must be
 *     supported for one specific network
 *
 * This module provides:
 *   - File-based CRUD (aligned with existing `storage.ts` `DATA_DIR` pattern)
 *   - A merge helper that combines builtin + the active customer's custom
 *     specs into one unified list for pickers / validators
 *   - Validation of user-submitted custom spec drafts
 *
 * Storage layout:
 *   ${DATA_DIR}/custom-specs/<customerId>.json
 *
 * The file is a JSON array of AssetSpec objects, each with source='custom'
 * and `customerId` set. Safe to load/mutate server-side only — do NOT import
 * this module from a "use client" component.
 * ---------------------------------------------------------------------------
 */

import fs from 'fs/promises'
import path from 'path'
import {
  ASSET_SPECS,
  AssetSpec,
  AssetMediaType,
  AssetCategory,
  Platform,
} from './assetSpecs'

const DATA_DIR = process.env.DATA_DIR || './data'
const CUSTOM_SPECS_DIR = 'custom-specs'

// ────────────────────────────────────────────────────────────────────────────
// Draft / Input Types
// ────────────────────────────────────────────────────────────────────────────

/** Fields a customer can set when creating a custom spec */
export interface CustomSpecDraft {
  mediaType: AssetMediaType
  category: AssetCategory
  platform: Platform
  name: string
  nameZh: string
  width: number
  height: number
  /** Optional — auto-computed from width/height if omitted */
  aspectRatio?: string
  minDurationSec?: number
  maxDurationSec?: number
  fps?: number | [number, number]
  maxFileSizeMB?: number
  acceptedFormats?: string[]
  notes?: string
  /** Default 'standard' */
  priority?: 'core' | 'standard' | 'niche'
}

// ────────────────────────────────────────────────────────────────────────────
// Low-level file helpers
// ────────────────────────────────────────────────────────────────────────────

function tenantFile(customerId: string): string {
  // Customer ids are expected to be alphanumeric + dash/underscore.
  // Strip anything else as a cheap guard against path traversal.
  const safe = customerId.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) throw new Error('Invalid customerId')
  return path.join(DATA_DIR, CUSTOM_SPECS_DIR, `${safe}.json`)
}

async function readTenantFile(customerId: string): Promise<AssetSpec[]> {
  try {
    const raw = await fs.readFile(tenantFile(customerId), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AssetSpec[]) : []
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw e
  }
}

async function writeTenantFile(customerId: string, specs: AssetSpec[]): Promise<void> {
  const file = tenantFile(customerId)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(specs, null, 2), 'utf-8')
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

export interface DraftValidation {
  ok: boolean
  errors: string[]
}

/** Very permissive validation — just enough to keep bad rows out of the file */
export function validateDraft(draft: CustomSpecDraft): DraftValidation {
  const errors: string[] = []

  if (!draft.name || draft.name.trim().length < 2) {
    errors.push('name must be at least 2 characters')
  }
  if (!draft.nameZh || draft.nameZh.trim().length < 1) {
    errors.push('nameZh is required')
  }
  if (!Number.isFinite(draft.width) || draft.width <= 0 || draft.width > 16384) {
    errors.push('width must be between 1 and 16384')
  }
  if (!Number.isFinite(draft.height) || draft.height <= 0 || draft.height > 16384) {
    errors.push('height must be between 1 and 16384')
  }
  if (draft.mediaType === 'video') {
    if (draft.minDurationSec !== undefined && draft.maxDurationSec !== undefined) {
      if (draft.minDurationSec > draft.maxDurationSec) {
        errors.push('minDurationSec cannot exceed maxDurationSec')
      }
    }
  }
  if (draft.acceptedFormats && draft.acceptedFormats.some(f => !/^[a-z0-9]{1,8}$/.test(f))) {
    errors.push('acceptedFormats entries must be short lowercase alphanumeric (e.g. "mp4", "jpg")')
  }

  return { ok: errors.length === 0, errors }
}

// ────────────────────────────────────────────────────────────────────────────
// CRUD
// ────────────────────────────────────────────────────────────────────────────

/** Returns all custom specs belonging to one customer. */
export async function listCustomSpecs(customerId: string): Promise<AssetSpec[]> {
  return readTenantFile(customerId)
}

/** Returns a single custom spec by id. */
export async function getCustomSpec(
  customerId: string,
  specId: string,
): Promise<AssetSpec | undefined> {
  const all = await readTenantFile(customerId)
  return all.find(s => s.id === specId)
}

/**
 * Create a new custom spec. Generates a stable id of the form
 * `custom-<customerId>-<slug>-<shortHash>`.
 * Throws on validation error.
 */
export async function createCustomSpec(
  customerId: string,
  draft: CustomSpecDraft,
): Promise<AssetSpec> {
  const v = validateDraft(draft)
  if (!v.ok) throw new Error(`Invalid custom spec: ${v.errors.join('; ')}`)

  const all = await readTenantFile(customerId)

  const slug = draft.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  const shortHash = Math.random().toString(36).slice(2, 8)
  const id = `custom-${customerId}-${slug}-${shortHash}`

  const now = Date.now()
  const spec: AssetSpec = {
    id,
    mediaType: draft.mediaType,
    category: draft.category,
    platform: draft.platform,
    name: draft.name.trim(),
    nameZh: draft.nameZh.trim(),
    width: draft.width,
    height: draft.height,
    aspectRatio: draft.aspectRatio ?? simplifyRatio(draft.width, draft.height),
    minDurationSec: draft.minDurationSec,
    maxDurationSec: draft.maxDurationSec,
    fps: draft.fps,
    maxFileSizeMB: draft.maxFileSizeMB,
    acceptedFormats: draft.acceptedFormats,
    notes: draft.notes,
    priority: draft.priority ?? 'standard',
    source: 'custom',
    customerId,
    createdAt: now,
    updatedAt: now,
  }

  all.push(spec)
  await writeTenantFile(customerId, all)
  return spec
}

/**
 * Update an existing custom spec. Only overwrites the fields provided in
 * `patch`. Returns the updated spec, or undefined if not found.
 */
export async function updateCustomSpec(
  customerId: string,
  specId: string,
  patch: Partial<CustomSpecDraft>,
): Promise<AssetSpec | undefined> {
  const all = await readTenantFile(customerId)
  const idx = all.findIndex(s => s.id === specId)
  if (idx === -1) return undefined

  const merged: AssetSpec = {
    ...all[idx],
    ...patch,
    // Recompute aspect ratio if dimensions changed and draft didn't override
    aspectRatio:
      patch.aspectRatio ??
      (patch.width || patch.height
        ? simplifyRatio(patch.width ?? all[idx].width, patch.height ?? all[idx].height)
        : all[idx].aspectRatio),
    updatedAt: Date.now(),
    // Preserve immutable identity fields
    id: all[idx].id,
    source: 'custom',
    customerId,
    createdAt: all[idx].createdAt,
  }

  // Validate the merged result as if it were a fresh draft
  const v = validateDraft({
    mediaType: merged.mediaType,
    category: merged.category,
    platform: merged.platform,
    name: merged.name,
    nameZh: merged.nameZh,
    width: merged.width,
    height: merged.height,
    aspectRatio: merged.aspectRatio,
    minDurationSec: merged.minDurationSec,
    maxDurationSec: merged.maxDurationSec,
    fps: merged.fps,
    maxFileSizeMB: merged.maxFileSizeMB,
    acceptedFormats: merged.acceptedFormats,
    notes: merged.notes,
    priority: merged.priority,
  })
  if (!v.ok) throw new Error(`Invalid patch: ${v.errors.join('; ')}`)

  all[idx] = merged
  await writeTenantFile(customerId, all)
  return merged
}

/** Delete a custom spec. Returns true if a row was removed. */
export async function deleteCustomSpec(
  customerId: string,
  specId: string,
): Promise<boolean> {
  const all = await readTenantFile(customerId)
  const next = all.filter(s => s.id !== specId)
  if (next.length === all.length) return false
  await writeTenantFile(customerId, next)
  return true
}

// ────────────────────────────────────────────────────────────────────────────
// Merged view (builtin + customer custom)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns the unified spec list a given customer sees in pickers:
 * all built-in specs followed by their own custom specs.
 * Passing `customerId = undefined` returns only built-ins.
 */
export async function getEffectiveSpecs(customerId?: string): Promise<AssetSpec[]> {
  if (!customerId) return ASSET_SPECS
  const custom = await readTenantFile(customerId)
  // Tag built-ins explicitly so consumers can filter by source
  const builtins = ASSET_SPECS.map(s => (s.source ? s : { ...s, source: 'builtin' as const }))
  return [...builtins, ...custom]
}

// ────────────────────────────────────────────────────────────────────────────
// Utils
// ────────────────────────────────────────────────────────────────────────────

/** Convert 1920x1080 → "16:9", 1080x1920 → "9:16", etc. */
function simplifyRatio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const d = gcd(Math.round(w), Math.round(h))
  return `${Math.round(w) / d}:${Math.round(h) / d}`
}
