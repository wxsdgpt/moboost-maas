/**
 * projectPersistence fixture tests
 *   (PCEC cycle 3 C12 + Phase 1.5 per-user scoping)
 * ============================================================================
 * Drives the persistence layer end-to-end against a temp DATA_DIR.  No mocks,
 * no test runner — exits 0 on full pass, 1 on any failure.  Same pattern as
 * cycle 1 specValidator.fixtures.ts and cycle 2 videoProbe.fixtures.ts.
 *
 * Phase 1.5 delta: every call now threads a Clerk-style userId through so
 * the on-disk path becomes <DATA_DIR>/users/<userId>/projects/<id>.json.
 * Two synthetic users (USER_A / USER_B) prove that their projects don't
 * bleed into each other.
 *
 * Run with:
 *     ./node_modules/.bin/sucrase-node src/lib/__tests__/projectPersistence.fixtures.ts
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

// IMPORTANT: set DATA_DIR BEFORE importing the persistence module so the
// module-level path resolver picks up the temp dir on first import.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'maas-persist-test-'))
process.env.DATA_DIR = TMP

import {
  persistProjectToDisk,
  restoreAllProjectsFromDisk,
  deleteProjectFromDisk,
  getStorageInfo,
  getProjectsDir,
  PROJECT_SCHEMA_VERSION,
} from '../projectPersistence'
import type { ProjectRecord } from '../store'

const USER_A = 'user_testA'
const USER_B = 'user_testB'

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builder
// ─────────────────────────────────────────────────────────────────────────────

function makeProject(id: string, msgCount = 3): ProjectRecord {
  return {
    id,
    name: `Test ${id}`,
    createdAt: new Date(2026, 3, 7, 12, 0, 0).toISOString(),
    jobs: [],
    messages: Array.from({ length: msgCount }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i} for ${id}`,
      timestamp: new Date(2026, 3, 7, 12, i, 0).toISOString(),
    })),
    assets: [],
    selectedAssetId: null,
    status: 'active',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cases
// ─────────────────────────────────────────────────────────────────────────────

interface Case {
  name: string
  run: () => Promise<true | string>
}

const cases: Case[] = [
  {
    name: 'getProjectsDir respects DATA_DIR env and includes user segment',
    run: async () => {
      const dir = getProjectsDir(USER_A)
      const expected = path.join(path.resolve(TMP), 'users', USER_A, 'projects')
      if (dir !== expected) return `expected ${expected}, got ${dir}`
      return true
    },
  },
  {
    name: 'persistProjectToDisk creates the directory and writes the file',
    run: async () => {
      const p = makeProject('proj-1000', 2)
      const written = await persistProjectToDisk(USER_A, p)
      if (!written.endsWith('proj-1000.json')) return `unexpected path ${written}`
      if (!written.includes(`users/${USER_A}/projects`))
        return `path missing user segment: ${written}`
      const exists = fs.existsSync(written)
      if (!exists) return 'file does not exist after write'
      const raw = fs.readFileSync(written, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed.__schemaVersion !== PROJECT_SCHEMA_VERSION) return 'schema version missing'
      if (typeof parsed.__persistedAt !== 'string') return 'persistedAt missing'
      if (parsed.project?.id !== 'proj-1000') return 'project payload wrong'
      if (parsed.project.messages.length !== 2) return 'message count wrong'
      return true
    },
  },
  {
    name: 'persistProjectToDisk overwrites cleanly on second write',
    run: async () => {
      const p = makeProject('proj-1001', 1)
      await persistProjectToDisk(USER_A, p)
      p.messages.push({
        id: 'msg-99',
        role: 'user',
        content: 'second pass',
        timestamp: new Date().toISOString(),
      })
      await persistProjectToDisk(USER_A, p)
      const raw = fs.readFileSync(
        path.join(getProjectsDir(USER_A), 'proj-1001.json'),
        'utf-8',
      )
      const parsed = JSON.parse(raw)
      if (parsed.project.messages.length !== 2)
        return `expected 2 msgs, got ${parsed.project.messages.length}`
      const dir = getProjectsDir(USER_A)
      const leftover = fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))
      if (leftover.length > 0) return `leftover tmp files: ${leftover.join(',')}`
      return true
    },
  },
  {
    name: 'restoreAllProjectsFromDisk reads back what was written',
    run: async () => {
      await persistProjectToDisk(USER_A, makeProject('proj-1002', 4))
      const all = await restoreAllProjectsFromDisk(USER_A)
      const ids = all.map((p) => p.id).sort()
      const expected = ['proj-1000', 'proj-1001', 'proj-1002']
      if (JSON.stringify(ids) !== JSON.stringify(expected))
        return `ids mismatch: ${JSON.stringify(ids)}`
      return true
    },
  },
  {
    name: 'per-user isolation: USER_B cannot see USER_A projects',
    run: async () => {
      const all = await restoreAllProjectsFromDisk(USER_B)
      if (all.length !== 0) return `USER_B should see 0 projects, got ${all.length}`
      // And USER_B can write their own without touching USER_A's dir
      await persistProjectToDisk(USER_B, makeProject('proj-B-1', 1))
      const bAll = await restoreAllProjectsFromDisk(USER_B)
      if (bAll.length !== 1) return `USER_B should have 1 project, got ${bAll.length}`
      if (bAll[0].id !== 'proj-B-1') return `wrong id in USER_B: ${bAll[0].id}`
      // USER_A still has their 3
      const aAll = await restoreAllProjectsFromDisk(USER_A)
      if (aAll.length !== 3) return `USER_A should still have 3, got ${aAll.length}`
      return true
    },
  },
  {
    name: 'per-user isolation: deleting in USER_A does not affect USER_B',
    run: async () => {
      await deleteProjectFromDisk(USER_A, 'proj-1002')
      const aAll = await restoreAllProjectsFromDisk(USER_A)
      if (aAll.length !== 2) return `USER_A should have 2 after delete, got ${aAll.length}`
      const bAll = await restoreAllProjectsFromDisk(USER_B)
      if (bAll.length !== 1) return `USER_B should still have 1, got ${bAll.length}`
      return true
    },
  },
  {
    name: 'restoreAllProjectsFromDisk skips files with future schema version',
    run: async () => {
      const dir = getProjectsDir(USER_A)
      const futureFile = path.join(dir, 'proj-future.json')
      fs.writeFileSync(
        futureFile,
        JSON.stringify({
          __schemaVersion: PROJECT_SCHEMA_VERSION + 99,
          project: makeProject('proj-future', 1),
        }),
      )
      const noVerFile = path.join(dir, 'proj-noversion.json')
      fs.writeFileSync(
        noVerFile,
        JSON.stringify({ project: makeProject('proj-noversion', 1) }),
      )
      const all = await restoreAllProjectsFromDisk(USER_A)
      const ids = all.map((p) => p.id)
      if (ids.includes('proj-future')) return 'should have skipped future-version file'
      if (ids.includes('proj-noversion')) return 'should have skipped no-version file'
      return true
    },
  },
  {
    name: 'restoreAllProjectsFromDisk skips malformed JSON without crashing',
    run: async () => {
      const dir = getProjectsDir(USER_A)
      fs.writeFileSync(path.join(dir, 'proj-broken.json'), '{not json[')
      const all = await restoreAllProjectsFromDisk(USER_A)
      const ids = all.map((p) => p.id)
      if (ids.includes('proj-broken')) return 'should have skipped broken file'
      if (!ids.includes('proj-1000')) return 'lost proj-1000 in process'
      return true
    },
  },
  {
    name: 'restoreAllProjectsFromDisk sorts newest createdAt first',
    run: async () => {
      const dir = getProjectsDir(USER_A)
      for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f))
      const oldP = makeProject('proj-old', 1)
      oldP.createdAt = '2024-01-01T00:00:00.000Z'
      const newP = makeProject('proj-new', 1)
      newP.createdAt = '2026-12-31T23:59:59.000Z'
      const midP = makeProject('proj-mid', 1)
      midP.createdAt = '2025-06-15T12:00:00.000Z'
      await persistProjectToDisk(USER_A, midP)
      await persistProjectToDisk(USER_A, oldP)
      await persistProjectToDisk(USER_A, newP)
      const all = await restoreAllProjectsFromDisk(USER_A)
      const ids = all.map((p) => p.id)
      if (JSON.stringify(ids) !== JSON.stringify(['proj-new', 'proj-mid', 'proj-old']))
        return `unexpected order: ${JSON.stringify(ids)}`
      return true
    },
  },
  {
    name: 'deleteProjectFromDisk removes the file',
    run: async () => {
      await deleteProjectFromDisk(USER_A, 'proj-mid')
      const all = await restoreAllProjectsFromDisk(USER_A)
      if (all.find((p) => p.id === 'proj-mid')) return 'proj-mid still present'
      return true
    },
  },
  {
    name: 'deleteProjectFromDisk is idempotent (no-op for missing files)',
    run: async () => {
      await deleteProjectFromDisk(USER_A, 'proj-does-not-exist')
      return true
    },
  },
  {
    name: 'unsafe project ids are rejected',
    run: async () => {
      const cases = ['../escape', 'foo/bar', 'has space', '', 'has\nnewline', 'a'.repeat(200)]
      for (const id of cases) {
        const p = makeProject(id as string, 1)
        let threw = false
        try {
          await persistProjectToDisk(USER_A, p)
        } catch {
          threw = true
        }
        if (!threw) return `should have rejected unsafe id: ${JSON.stringify(id)}`
      }
      return true
    },
  },
  {
    name: 'unsafe user ids are rejected',
    run: async () => {
      const badIds = ['../escape', 'foo/bar', 'has space', '', 'has\nnewline', 'a'.repeat(200)]
      for (const uid of badIds) {
        let threw = false
        try {
          getProjectsDir(uid as string)
        } catch {
          threw = true
        }
        if (!threw) return `should have rejected unsafe user id: ${JSON.stringify(uid)}`
      }
      return true
    },
  },
  {
    name: 'getStorageInfo reports correct counts and bytes for user',
    run: async () => {
      const info = await getStorageInfo(USER_A)
      if (!info.exists) return 'directory should exist'
      if (info.schemaVersion !== PROJECT_SCHEMA_VERSION) return 'schemaVersion wrong'
      if (info.userId !== USER_A) return `userId mismatch: ${info.userId}`
      if (info.fileCount < 2) return `expected at least 2 files, got ${info.fileCount}`
      if (info.totalBytes < 100) return `bytes seem too low: ${info.totalBytes}`
      if (!path.isAbsolute(info.projectsDir)) return 'projectsDir should be absolute'
      if (!info.projectsDir.includes(`users/${USER_A}/projects`))
        return `projectsDir missing user segment: ${info.projectsDir}`
      return true
    },
  },
  {
    name: 'getStorageInfo for a brand-new user returns exists=false',
    run: async () => {
      const info = await getStorageInfo('user_never_persisted')
      if (info.exists) return 'fresh user dir should not exist'
      if (info.fileCount !== 0) return `fresh user count expected 0, got ${info.fileCount}`
      if (info.userId !== 'user_never_persisted') return 'userId mismatch'
      return true
    },
  },
  {
    name: 'persisted file is valid UTF-8 with stable JSON formatting',
    run: async () => {
      const p = makeProject('proj-format', 1)
      p.messages[0].content = '中文测试 — 验证 UTF-8 字符正常持久化'
      const written = await persistProjectToDisk(USER_A, p)
      const raw = fs.readFileSync(written, 'utf-8')
      if (!raw.includes('中文测试')) return 'UTF-8 not preserved'
      if (!raw.includes('\n  "__schemaVersion"')) return 'expected pretty-printed JSON'
      return true
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  let passed = 0
  let failed = 0
  for (const c of cases) {
    let result: true | string
    try {
      result = await c.run()
    } catch (e) {
      result = `THREW: ${(e as Error).message}`
    }
    if (result === true) {
      console.log(`  ✓ ${c.name}`)
      passed++
    } else {
      console.log(`  ✗ ${c.name}  →  ${result}`)
      failed++
    }
  }
  console.log(`\n${passed}/${passed + failed} passed${failed ? `, ${failed} failed` : ''}`)
  try {
    fs.rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  process.exit(failed === 0 ? 0 : 1)
}

main()
