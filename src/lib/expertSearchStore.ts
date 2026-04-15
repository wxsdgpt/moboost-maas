/**
 * Expert Search Result Store
 * ---------------------------------------------------------------------------
 * xu 要求 Stage 2 专家补全的结果"沉淀到本地"，方便下次相同/相似查询直接复用，
 * 也方便 PCEC 周期回顾哪些查询高频出现、哪些来源被实际点击。
 *
 * 存储结构（基于文件系统，无外部依赖）：
 *
 *   ${DATA_DIR}/expert-search/
 *     index.json                 ← 所有查询的 metadata + 指向 cache file
 *     cache/<queryHash>.json     ← 每条查询的完整 ScoredResult[]
 *
 * Cache key = sha256(normalize(query) + '|' + categoriesCsv).slice(0,16)
 * TTL 默认 7 天，超过 TTL 视为失效但不立即删除（供 PCEC 分析历史趋势）。
 */
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import type { ScoredResult } from './sourceQuality'
import type { SourceCategory } from './trustedSources'

const DATA_DIR = process.env.DATA_DIR || './data'
const STORE_ROOT = path.join(DATA_DIR, 'expert-search')
const CACHE_DIR = path.join(STORE_ROOT, 'cache')
const INDEX_PATH = path.join(STORE_ROOT, 'index.json')
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface SearchQueryMeta {
  hash: string
  query: string
  categories: SourceCategory[]
  createdAt: number
  expiresAt: number
  resultCount: number
  /** Highest score in the result set, for quick triage */
  topScore: number
  /** How many times xu (or the clarify pipeline) has re-hit this cached entry */
  hitCount: number
}

export interface IndexFile {
  version: 1
  entries: SearchQueryMeta[]
}

async function ensureDirs() {
  await fs.mkdir(CACHE_DIR, { recursive: true })
}

export function hashQuery(query: string, categories: SourceCategory[]): string {
  const norm = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const catKey = [...categories].sort().join(',')
  return crypto
    .createHash('sha256')
    .update(norm + '|' + catKey)
    .digest('hex')
    .slice(0, 16)
}

async function readIndex(): Promise<IndexFile> {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as IndexFile
    if (parsed.version !== 1) return { version: 1, entries: [] }
    return parsed
  } catch {
    return { version: 1, entries: [] }
  }
}

async function writeIndex(idx: IndexFile): Promise<void> {
  await ensureDirs()
  const tmp = INDEX_PATH + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(idx, null, 2), 'utf-8')
  await fs.rename(tmp, INDEX_PATH)
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function loadCachedResults(
  query: string,
  categories: SourceCategory[],
): Promise<{ meta: SearchQueryMeta; results: ScoredResult[] } | null> {
  await ensureDirs()
  const hash = hashQuery(query, categories)
  const idx = await readIndex()
  const meta = idx.entries.find((e) => e.hash === hash)
  if (!meta) return null
  if (Date.now() > meta.expiresAt) return null

  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${hash}.json`), 'utf-8')
    const results = JSON.parse(raw) as ScoredResult[]

    // Bump hit count
    meta.hitCount += 1
    await writeIndex(idx)

    return { meta, results }
  } catch {
    return null
  }
}

export async function saveResults(
  query: string,
  categories: SourceCategory[],
  results: ScoredResult[],
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<SearchQueryMeta> {
  await ensureDirs()
  const hash = hashQuery(query, categories)
  const now = Date.now()

  const meta: SearchQueryMeta = {
    hash,
    query,
    categories,
    createdAt: now,
    expiresAt: now + ttlMs,
    resultCount: results.length,
    topScore: results.length ? results[0].scores.total : 0,
    hitCount: 0,
  }

  const idx = await readIndex()
  const existingIdx = idx.entries.findIndex((e) => e.hash === hash)
  if (existingIdx >= 0) {
    // Preserve prior hit count on refresh
    meta.hitCount = idx.entries[existingIdx].hitCount
    idx.entries[existingIdx] = meta
  } else {
    idx.entries.unshift(meta)
  }

  // Cap index at 500 entries (prune oldest by createdAt)
  if (idx.entries.length > 500) {
    idx.entries.sort((a, b) => b.createdAt - a.createdAt)
    idx.entries.length = 500
  }

  await fs.writeFile(
    path.join(CACHE_DIR, `${hash}.json`),
    JSON.stringify(results, null, 2),
    'utf-8',
  )
  await writeIndex(idx)
  return meta
}

export async function listRecentQueries(limit = 50): Promise<SearchQueryMeta[]> {
  const idx = await readIndex()
  return idx.entries.slice(0, limit)
}

export async function pruneExpired(): Promise<number> {
  const idx = await readIndex()
  const now = Date.now()
  const before = idx.entries.length
  const expired = idx.entries.filter((e) => e.expiresAt < now)
  const fresh = idx.entries.filter((e) => e.expiresAt >= now)

  for (const e of expired) {
    try {
      await fs.unlink(path.join(CACHE_DIR, `${e.hash}.json`))
    } catch {
      /* ignore */
    }
  }

  if (expired.length) {
    await writeIndex({ version: 1, entries: fresh })
  }
  return before - fresh.length
}
