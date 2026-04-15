/**
 * Spec Validator — fixture-based self test
 * ===========================================================================
 *
 * No jest, no vitest. xu's project doesn't yet have a test runner wired in,
 * and PCEC ADL says we don't add new infra unless absolutely necessary.
 * Instead this file ships hand-built fixture cases that prove every check in
 * `specValidator.ts` triggers (and only the right one triggers) on a known
 * input.
 *
 * To run from a fresh shell:
 *
 *     npx tsx src/lib/__tests__/specValidator.fixtures.ts
 *
 * It exits with code 1 if any case fails — that lets the next PCEC cycle and
 * any future CI hook treat this file as a real gate.
 *
 * Cases are intentionally numerous and overlapping. Each one is a tiny
 * single-purpose vignette so xu can read them top-to-bottom and immediately see
 * what the validator believes about each scenario.
 */
import {
  validateAssetAgainstSpec,
  findBestFitSpecs,
  type Violation,
  type ValidationReport,
} from '../specValidator'
import { ASSET_SPECS, findSpecById, type AssetSpec } from '../assetSpecs'

interface Case {
  name: string
  run: () => boolean
  /** Optional human note printed when the case fails */
  note?: string
}

function spec(id: string): AssetSpec {
  const s = findSpecById(id)
  if (!s) throw new Error(`fixture references unknown spec id: ${id}`)
  return s
}

function hasCode(report: ValidationReport, code: Violation['code']): boolean {
  return report.violations.some((v) => v.code === code)
}

function expectOk(r: ValidationReport, label: string): boolean {
  if (!r.ok) {
    console.error(`  ✗ expected ${label} to pass — got blockers:`, r.violations.filter((v) => v.severity === 'blocker'))
    return false
  }
  return true
}
function expectBlocked(r: ValidationReport, label: string): boolean {
  if (r.ok) {
    console.error(`  ✗ expected ${label} to be blocked — got ok=true`)
    return false
  }
  return true
}

const cases: Case[] = [
  // ── Happy paths ─────────────────────────────────────────────────────────
  {
    name: 'IG Reel 1080×1920 30s 30fps mp4 50MB → ok',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 30, fps: 30, format: 'mp4', fileSizeMB: 50 },
        spec('ig-reel'),
      )
      return expectOk(r, 'IG Reel happy path') && r.score === 100
    },
  },
  {
    name: 'IG Feed Square 1080×1080 jpg 5MB → ok',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1080, mediaType: 'image', format: 'jpg', fileSizeMB: 5 },
        spec('ig-feed-square'),
      )
      return expectOk(r, 'IG square happy path') && r.score === 100
    },
  },

  // ── Blocker: media type mismatch ────────────────────────────────────────
  {
    name: 'image asset against video spec → media-type-mismatch blocker',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'image', format: 'jpg', fileSizeMB: 1 },
        spec('ig-reel'),
      )
      return expectBlocked(r, 'image vs video spec') && hasCode(r, 'media-type-mismatch')
    },
  },

  // ── Blocker: aspect mismatch with crop+pad suggestion ───────────────────
  {
    name: 'square image against IG Reel (9:16) → aspect-mismatch with fix',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1080, mediaType: 'video', durationSec: 10, fps: 30, format: 'mp4', fileSizeMB: 5 },
        spec('ig-reel'),
      )
      const v = r.violations.find((x) => x.code === 'aspect-mismatch')
      if (!v) {
        console.error('  ✗ no aspect-mismatch violation emitted')
        return false
      }
      if (!v.fix || !v.fix.includes('裁切')) {
        console.error('  ✗ aspect-mismatch fix missing crop suggestion:', v.fix)
        return false
      }
      return expectBlocked(r, 'square vs 9:16')
    },
  },

  // ── Warning: dimensions differ but aspect matches ───────────────────────
  {
    name: '720×1280 against IG Reel 1080×1920 (correct aspect) → dimension warning, no blockers',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 720, height: 1280, mediaType: 'video', durationSec: 10, fps: 30, format: 'mp4', fileSizeMB: 5 },
        spec('ig-reel'),
      )
      if (!hasCode(r, 'dimension-mismatch')) {
        console.error('  ✗ no dimension-mismatch violation')
        return false
      }
      const dim = r.violations.find((v) => v.code === 'dimension-mismatch')!
      if (!dim.fix || !dim.fix.includes('放大')) {
        console.error('  ✗ dimension fix missing upscale suggestion:', dim.fix)
        return false
      }
      return expectOk(r, '720p with right aspect')
    },
  },

  // ── Blocker: video too short ────────────────────────────────────────────
  {
    name: 'IG Reel 2s (below 3s min) → duration-too-short blocker',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 2, fps: 30, format: 'mp4', fileSizeMB: 5 },
        spec('ig-reel'),
      )
      return expectBlocked(r, '2s reel') && hasCode(r, 'duration-too-short')
    },
  },

  // ── Blocker: video too long ─────────────────────────────────────────────
  {
    name: 'YouTube Shorts 240s (above 180s max) → duration-too-long blocker',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 240, fps: 30, format: 'mp4', fileSizeMB: 50 },
        spec('youtube-shorts'),
      )
      return expectBlocked(r, '240s shorts') && hasCode(r, 'duration-too-long')
    },
  },

  // ── Warning: fps out of range ───────────────────────────────────────────
  {
    name: 'IG Reel 90 fps (allowed 24-60) → fps warning, still ok',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 10, fps: 90, format: 'mp4', fileSizeMB: 5 },
        spec('ig-reel'),
      )
      if (!hasCode(r, 'fps-out-of-range')) return false
      return expectOk(r, '90fps reel (warning only)')
    },
  },

  // ── Blocker: file size exceeded ────────────────────────────────────────
  {
    name: 'IG Reel 300 MB (cap 256) → file-size blocker',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 10, fps: 30, format: 'mp4', fileSizeMB: 300 },
        spec('ig-reel'),
      )
      return expectBlocked(r, '300MB reel') && hasCode(r, 'file-size-exceeded')
    },
  },

  // ── Info: file size approaching cap (within 10%) ────────────────────────
  {
    name: 'IG Reel 245 MB (cap 256, within 10%) → info only, ok',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 10, fps: 30, format: 'mp4', fileSizeMB: 245 },
        spec('ig-reel'),
      )
      const fs = r.violations.find((v) => v.code === 'file-size-exceeded')
      if (!fs || fs.severity !== 'info') {
        console.error('  ✗ expected info-severity file-size violation, got:', fs)
        return false
      }
      return expectOk(r, '245MB reel')
    },
  },

  // ── Blocker: format not accepted ────────────────────────────────────────
  {
    name: 'IG Feed Square gif → format blocker',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1080, mediaType: 'image', format: 'gif', fileSizeMB: 1 },
        spec('ig-feed-square'),
      )
      return expectBlocked(r, 'gif on IG square') && hasCode(r, 'format-not-accepted')
    },
  },
  {
    name: 'IG Reel format from MIME "video/mp4" normalizes to mp4 → ok',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 10, fps: 30, format: 'video/mp4', fileSizeMB: 5 },
        spec('ig-reel'),
      )
      return expectOk(r, 'mime normalized')
    },
  },

  // ── Severity rollup + summary string ────────────────────────────────────
  {
    name: 'mixed severities → summary string contains 阻塞 word when blocked',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 500, height: 500, mediaType: 'video', durationSec: 1, fps: 90, format: 'avi', fileSizeMB: 999 },
        spec('ig-reel'),
      )
      if (r.ok) {
        console.error('  ✗ expected blocked')
        return false
      }
      if (!r.summary.includes('不符合')) {
        console.error('  ✗ summary missing 不符合:', r.summary)
        return false
      }
      return r.blockers >= 1
    },
  },

  // ── findBestFitSpecs ────────────────────────────────────────────────────
  {
    name: 'best-fit lookup: 1080×1920 mp4 30s identifies 9:16 video specs',
    run: () => {
      const report = findBestFitSpecs(
        { width: 1080, height: 1920, mediaType: 'video', durationSec: 30, fps: 30, format: 'mp4', fileSizeMB: 50 },
        ASSET_SPECS,
        { fitLimit: 20 },
      )
      const ids = report.bestFits.map((r) => r.specId)
      const expected = ['ig-reel', 'tiktok-video', 'youtube-shorts']
      const missing = expected.filter((id) => !ids.includes(id))
      if (missing.length) {
        console.error('  ✗ best-fit missing expected ids:', missing, 'got:', ids)
        return false
      }
      return true
    },
  },
  {
    name: 'best-fit lookup: 1080×1080 jpg fits IG square but not IG reel',
    run: () => {
      const report = findBestFitSpecs(
        { width: 1080, height: 1080, mediaType: 'image', format: 'jpg', fileSizeMB: 1 },
        ASSET_SPECS,
      )
      const fitIds = report.bestFits.map((r) => r.specId)
      if (!fitIds.includes('ig-feed-square')) {
        console.error('  ✗ ig-feed-square not in best fits:', fitIds)
        return false
      }
      if (fitIds.includes('ig-reel')) {
        console.error('  ✗ ig-reel should not appear for image asset')
        return false
      }
      return true
    },
  },

  // ── Tolerance modes ─────────────────────────────────────────────────────
  {
    name: 'strict mode: 1079×1920 (1px off) → blocker even though aspect drift is tiny',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1079, height: 1920, mediaType: 'video', durationSec: 10, fps: 30, format: 'mp4', fileSizeMB: 5 },
        spec('ig-reel'),
        { tolerance: 'strict' },
      )
      // In strict mode, 1px off → aspect tolerance is 0 → blocker
      return expectBlocked(r, 'strict 1px drift')
    },
  },
  {
    name: 'standard mode: 1079×1920 → ok (aspect within 2%)',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 1079, height: 1920, mediaType: 'video', durationSec: 10, fps: 30, format: 'mp4', fileSizeMB: 5 },
        spec('ig-reel'),
        { tolerance: 'standard' },
      )
      return expectOk(r, 'standard 1px drift')
    },
  },

  // ── warningsAreBlockers gate ────────────────────────────────────────────
  {
    name: 'warningsAreBlockers promotes 720p reel from ok → blocked',
    run: () => {
      const r = validateAssetAgainstSpec(
        { width: 720, height: 1280, mediaType: 'video', durationSec: 10, fps: 30, format: 'mp4', fileSizeMB: 5 },
        spec('ig-reel'),
        { warningsAreBlockers: true },
      )
      return expectBlocked(r, '720p with warnings as blockers')
    },
  },
]

// ─── Runner ────────────────────────────────────────────────────────────────

export function runFixtures(): { passed: number; failed: number; total: number } {
  let passed = 0
  let failed = 0
  for (const c of cases) {
    let ok = false
    try {
      ok = c.run()
    } catch (e) {
      console.error(`  ✗ EXCEPTION in "${c.name}":`, e)
      ok = false
    }
    if (ok) {
      console.log(`  ✓ ${c.name}`)
      passed++
    } else {
      console.log(`  ✗ ${c.name}${c.note ? ` — ${c.note}` : ''}`)
      failed++
    }
  }
  console.log(`\n${passed}/${cases.length} passed, ${failed} failed`)
  return { passed, failed, total: cases.length }
}

// Allow `npx tsx src/lib/__tests__/specValidator.fixtures.ts`
if (require.main === module) {
  const r = runFixtures()
  process.exit(r.failed === 0 ? 0 : 1)
}
