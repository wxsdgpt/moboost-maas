/**
 * POST /api/spec/validate
 * ===========================================================================
 * Stateless wrapper around `lib/specValidator`. Two modes:
 *
 *   1. "validate"  — caller passes asset + specIds[], we return one report per
 *                    spec sorted by score desc.
 *   2. "best-fit"  — caller passes asset only (optionally a candidate id list),
 *                    we run findBestFitSpecs across the requested pool and
 *                    return both perfect fits and near-misses.
 *
 * Request body
 * ------------
 *   {
 *     mode?: 'validate' | 'best-fit'   // default 'validate'
 *     asset: ProducedAsset             // required
 *     specIds?: string[]               // for mode=validate, required
 *     pool?: 'all' | 'core' | 'igaming' // for mode=best-fit, default 'all'
 *     options?: ValidationOptions      // tolerance, warningsAreBlockers,…
 *     fitLimit?: number                // best-fit only
 *     nearMissLimit?: number           // best-fit only
 *   }
 *
 * Response (mode=validate)
 *   { ok: true, mode: 'validate', reports: ValidationReport[] }
 *
 * Response (mode=best-fit)
 *   { ok: true, mode: 'best-fit', bestFits, nearMisses, total }
 *
 * Errors all return { ok: false, error: '<machine_code>', detail?: '...' }.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  validateAssetAgainstSpecs,
  findBestFitSpecs,
  type ProducedAsset,
  type ValidationOptions,
} from '@/lib/specValidator'
import {
  ASSET_SPECS,
  CORE_SPECS,
  IGAMING_SPECS,
  findSpecById,
  type AssetSpec,
} from '@/lib/assetSpecs'

export const runtime = 'nodejs'

interface ValidateBody {
  mode?: 'validate' | 'best-fit'
  asset: ProducedAsset
  specIds?: string[]
  pool?: 'all' | 'core' | 'igaming'
  options?: ValidationOptions
  fitLimit?: number
  nearMissLimit?: number
  nearMissThreshold?: number
}

function pickPool(pool: ValidateBody['pool']): AssetSpec[] {
  switch (pool) {
    case 'core':
      return CORE_SPECS
    case 'igaming':
      return IGAMING_SPECS
    case 'all':
    default:
      return ASSET_SPECS
  }
}

function isValidAsset(a: unknown): a is ProducedAsset {
  if (!a || typeof a !== 'object') return false
  const asset = a as Record<string, unknown>
  return typeof asset.width === 'number' && typeof asset.height === 'number'
}

export async function POST(req: NextRequest) {
  let body: ValidateBody
  try {
    body = (await req.json()) as ValidateBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (!isValidAsset(body.asset)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_asset',
        detail: 'asset must include numeric width and height',
      },
      { status: 422 },
    )
  }

  const mode = body.mode || 'validate'
  const opts = body.options || {}

  if (mode === 'validate') {
    if (!Array.isArray(body.specIds) || body.specIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'specIds_required' },
        { status: 422 },
      )
    }
    if (body.specIds.length > 50) {
      return NextResponse.json(
        { ok: false, error: 'too_many_specs', detail: 'max 50 specIds per request' },
        { status: 422 },
      )
    }
    const specs: AssetSpec[] = []
    const unknown: string[] = []
    for (const id of body.specIds) {
      const s = findSpecById(id)
      if (s) specs.push(s)
      else unknown.push(id)
    }
    if (specs.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'no_known_specs', unknownSpecIds: unknown },
        { status: 422 },
      )
    }
    const reports = validateAssetAgainstSpecs(body.asset, specs, opts)
    return NextResponse.json({
      ok: true,
      mode: 'validate',
      asset: body.asset,
      reports,
      unknownSpecIds: unknown,
    })
  }

  // mode === 'best-fit'
  const pool = pickPool(body.pool)
  const report = findBestFitSpecs(body.asset, pool, {
    ...opts,
    fitLimit: body.fitLimit,
    nearMissLimit: body.nearMissLimit,
    nearMissThreshold: body.nearMissThreshold,
  })
  return NextResponse.json({
    ok: true,
    mode: 'best-fit',
    pool: body.pool || 'all',
    asset: body.asset,
    bestFits: report.bestFits,
    nearMisses: report.nearMisses,
    totalChecked: report.candidates.length,
  })
}

export async function GET() {
  return NextResponse.json({
    usage: {
      validate: {
        method: 'POST',
        body: {
          mode: 'validate',
          asset: { width: 1080, height: 1920, mediaType: 'video', durationSec: 30, format: 'mp4', fileSizeMB: 50 },
          specIds: ['ig-reel', 'tiktok-video', 'youtube-shorts'],
          options: { tolerance: 'standard' },
        },
      },
      bestFit: {
        method: 'POST',
        body: {
          mode: 'best-fit',
          asset: { width: 1080, height: 1080, mediaType: 'image', format: 'jpg' },
          pool: 'core',
          fitLimit: 5,
        },
      },
    },
    pools: ['all', 'core', 'igaming'],
    tolerances: ['strict', 'standard', 'lenient'],
  })
}
