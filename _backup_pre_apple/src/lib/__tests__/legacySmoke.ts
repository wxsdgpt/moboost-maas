/**
 * Legacy validateAsset() backward-compat smoke test
 * ===========================================================================
 * After PCEC 2026-04-08 we rerouted the legacy `validateAsset()` in
 * `assetSpecs.ts` to call into the new `validateAssetAgainstSpec()` from
 * `specValidator.ts`. ADL says stability > novelty: any old caller importing
 * the legacy function MUST keep working.
 *
 * This file proves it. Run with:
 *
 *     ./node_modules/.bin/sucrase-node src/lib/__tests__/legacySmoke.ts
 *
 * Exits 0 if the legacy shape is preserved, 1 otherwise.
 */
import { validateAsset, findSpecById } from '../assetSpecs'

const spec = findSpecById('ig-reel')
if (!spec) {
  console.error('FAIL: ig-reel spec not found')
  process.exit(1)
}

// Bad asset: square frame, 1s duration, oversize file, wrong format
const out = validateAsset(
  { width: 1080, height: 1080, durationSec: 1, fileSizeMB: 999, format: 'avi' },
  spec,
)

const checks = [
  { name: 'ok is false', pass: out.ok === false },
  { name: 'errors is array', pass: Array.isArray(out.errors) },
  { name: 'warnings is array', pass: Array.isArray(out.warnings) },
  { name: 'has at least 3 blocking errors', pass: out.errors.length >= 3 },
  {
    name: 'first error message is non-empty string',
    pass: typeof out.errors[0] === 'string' && out.errors[0].length > 0,
  },
]

let failed = 0
for (const c of checks) {
  if (c.pass) console.log(`  ✓ ${c.name}`)
  else {
    console.log(`  ✗ ${c.name}`)
    failed++
  }
}

if (failed === 0) {
  console.log('\nlegacy validateAsset shape preserved ✓')
  process.exit(0)
} else {
  console.log(`\n${failed} legacy compat checks failed`)
  process.exit(1)
}
