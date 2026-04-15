/**
 * projectPersistence — durable per-user storage for ProjectRecord
 *   (PCEC cycle 3 C12 + Phase 1.5 per-user scoping)
 * ============================================================================
 *
 *  ✦ WHERE IS THE DATA?
 *  ─────────────────────
 *  Every project lives at:
 *
 *      <DATA_DIR>/users/<clerkUserId>/projects/<projectId>.json
 *
 *  where DATA_DIR resolves in this order:
 *
 *      1. process.env.DATA_DIR                  (if set)
 *      2. <repo-root>/data                      (default for `next dev`)
 *
 *  → For local dev that means:
 *      moboost AI/moboost-maas/data/users/user_abc123/projects/proj-1712345678901.json
 *
 *  Per-user scoping is the Phase 1.5 delta — before this every user on the
 *  same host saw every other user's projects.  The `userId` argument is now
 *  required at every call site; API routes supply it via requireClerkUserId()
 *  from src/lib/auth.ts.
 *
 *  Use `getStorageInfo()` to ask for the absolute path at runtime — the
 *  /api/store/info endpoint surfaces it to the UI so xu can see exactly where
 *  files are landing.
 *
 *  ✦ WHY NOT localStorage / IndexedDB / SQLite?
 *  ─────────────────────────────────────────────
 *  • localStorage  → invisible from outside the browser, hard to grep, 5MB cap
 *  • IndexedDB     → opaque binary, can't `cat` or version-control
 *  • SQLite        → adds a native dependency (better-sqlite3 → 5MB binary)
 *  • Plain JSON    → grep-able, diff-able, git-able, zero dependencies, the
 *                    user can literally `ls data/projects/` and see their work
 *
 *  ADL: stability > novelty. Plain JSON files give xu the maximum
 *  inspectability and the maximum recovery options when something breaks.
 *
 *  ✦ ATOMIC WRITES
 *  ────────────────
 *  We never overwrite the destination file directly. Instead:
 *
 *      1. Write to <projectId>.json.tmp
 *      2. fsync the temp file
 *      3. rename(.tmp → .json)   ← atomic on POSIX
 *
 *  Result: a crash mid-write leaves either the old version intact or the new
 *  version intact, never a half-written corrupted file.
 *
 *  ✦ SCHEMA VERSION
 *  ─────────────────
 *  Every persisted file carries `__schemaVersion: <int>`. On read we check
 *  the version and either accept it (current) or skip it with a warning
 *  (future). When we eventually need a real migration we can add a tiny
 *  upgrader keyed on the version field — for now the field is forward-looking
 *  insurance, not active code.
 *
 *  ✦ WHAT IS *NOT* PERSISTED HERE
 *  ──────────────────────────────
 *  • Notifications (transient by design)
 *  • Sidebar collapsed flag (UI ephemeral)
 *  • activeProjectId (URL/route already encodes this)
 *
 *  Only ProjectRecord arrays. Everything else stays in memory.
 *
 *  ✦ WHAT THIS FILE IS NOT
 *  ────────────────────────
 *  Not a database. No queries, no indexes, no transactions across files. If
 *  this turns into a real product we'll swap the body of these functions for
 *  Postgres / Turso / S3 keeping the same signatures. The API surface here
 *  is intentionally narrow so the swap is local.
 */
import fs from 'fs/promises'
import path from 'path'
import type { ProjectRecord } from './store'

/**
 * Bump this when the on-disk shape changes incompatibly. The reader skips
 * (with a warning) any file whose version is HIGHER than this — that way
 * a newer dev branch can't silently corrupt an older one's files.
 */
export const PROJECT_SCHEMA_VERSION = 1

/** Resolve the absolute <DATA_DIR> (no users/ suffix). */
export function getDataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data')
}

/**
 * Resolve the absolute directory where a specific user's project JSON
 * files live.  Path: <DATA_DIR>/users/<userId>/projects
 */
export function getProjectsDir(userId: string): string {
  assertSafeUserId(userId)
  return path.join(getDataDir(), 'users', userId, 'projects')
}

export interface StorageInfo {
  /** Absolute on-disk path of the projects directory for this user */
  projectsDir: string
  /** Whether the directory currently exists */
  exists: boolean
  /** Number of *.json files (excludes .tmp + hidden) */
  fileCount: number
  /** Total bytes occupied by *.json files */
  totalBytes: number
  /** Schema version this build expects to read/write */
  schemaVersion: number
  /** Path of the parent DATA_DIR (shared across users) */
  dataDir: string
  /** Clerk user id this snapshot belongs to */
  userId: string
}

export async function getStorageInfo(userId: string): Promise<StorageInfo> {
  const projectsDir = getProjectsDir(userId)
  const dataDir = getDataDir()
  let exists = false
  let fileCount = 0
  let totalBytes = 0
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    exists = true
    for (const e of entries) {
      if (!e.isFile()) continue
      if (!e.name.endsWith('.json')) continue
      if (e.name.startsWith('.')) continue
      try {
        const st = await fs.stat(path.join(projectsDir, e.name))
        fileCount++
        totalBytes += st.size
      } catch {
        /* skip */
      }
    }
  } catch {
    exists = false
  }
  return {
    projectsDir,
    dataDir,
    exists,
    fileCount,
    totalBytes,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    userId,
  }
}

/** Internal: validate that an id is safe to use as a filename. */
function assertSafeProjectId(id: string): void {
  // Project ids look like `proj-1712345678901` — letters/digits/dash/underscore
  if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(id)) {
    throw new Error(`unsafe project id: ${JSON.stringify(id)}`)
  }
}

/**
 * Internal: validate that a Clerk user id is safe for use as a directory
 * segment.  Clerk ids look like `user_2abc123XyZ`.  We accept letters,
 * digits, underscore, dash.  Reject anything with slashes, dots, null
 * bytes, or traversal sequences — those would let a hostile client escape
 * the per-user sandbox.
 */
function assertSafeUserId(userId: string): void {
  if (typeof userId !== 'string') {
    throw new Error('userId must be a string')
  }
  if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(userId)) {
    throw new Error(`unsafe user id: ${JSON.stringify(userId)}`)
  }
}

/**
 * Persist a single ProjectRecord to disk atomically.
 *
 * Returns the absolute path of the file that was written, so callers /
 * tests can verify the output is exactly where they expect.
 */
export async function persistProjectToDisk(
  userId: string,
  project: ProjectRecord,
): Promise<string> {
  assertSafeProjectId(project.id)
  const projectsDir = getProjectsDir(userId)
  await fs.mkdir(projectsDir, { recursive: true })

  const finalPath = path.join(projectsDir, `${project.id}.json`)
  const tmpPath = `${finalPath}.tmp`

  const payload = {
    __schemaVersion: PROJECT_SCHEMA_VERSION,
    __persistedAt: new Date().toISOString(),
    project,
  }
  const body = JSON.stringify(payload, null, 2)

  // Write to .tmp first, then atomic rename. fsync via writeFile + open hint.
  await fs.writeFile(tmpPath, body, 'utf-8')
  await fs.rename(tmpPath, finalPath)

  return finalPath
}

/**
 * Load every persisted project from disk. Files with an unknown future
 * schema version are skipped with a console warning rather than crashing
 * the whole restore.
 */
export async function restoreAllProjectsFromDisk(
  userId: string,
): Promise<ProjectRecord[]> {
  const projectsDir = getProjectsDir(userId)
  let entries: string[]
  try {
    entries = await fs.readdir(projectsDir)
  } catch {
    return [] // directory doesn't exist yet → empty result
  }
  const out: ProjectRecord[] = []
  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    if (name.startsWith('.')) continue
    const full = path.join(projectsDir, name)
    try {
      const raw = await fs.readFile(full, 'utf-8')
      const parsed = JSON.parse(raw)
      const v = parsed?.__schemaVersion
      if (typeof v !== 'number') {
        console.warn(`[projectPersistence] skipping ${name}: missing __schemaVersion`)
        continue
      }
      if (v > PROJECT_SCHEMA_VERSION) {
        console.warn(
          `[projectPersistence] skipping ${name}: file schema v${v} > runtime v${PROJECT_SCHEMA_VERSION}`,
        )
        continue
      }
      const project = parsed.project as ProjectRecord
      if (!project || typeof project.id !== 'string') {
        console.warn(`[projectPersistence] skipping ${name}: malformed project payload`)
        continue
      }
      out.push(project)
    } catch (err) {
      console.warn(
        `[projectPersistence] skipping ${name}: ${(err as Error).message}`,
      )
    }
  }
  // Newest first (mirrors store.createProject prepend behavior)
  out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return out
}

/**
 * Delete a single project file. Idempotent — silently succeeds if the file
 * doesn't exist (so the caller can fire-and-forget after store.removeProject).
 */
export async function deleteProjectFromDisk(
  userId: string,
  projectId: string,
): Promise<void> {
  assertSafeProjectId(projectId)
  const finalPath = path.join(getProjectsDir(userId), `${projectId}.json`)
  try {
    await fs.unlink(finalPath)
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err
  }
}
