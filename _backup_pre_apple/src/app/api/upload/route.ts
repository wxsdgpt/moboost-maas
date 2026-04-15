/**
 * POST /api/upload
 *
 * Accepts multipart/form-data with a single `file` field and (optionally) a
 * `briefId` field. Stores the file under `public/uploads/<yyyymmdd>/<uuid>.<ext>`
 * so Next.js serves it statically at `/uploads/<yyyymmdd>/<uuid>.<ext>`.
 *
 * Returns an `UploadedAsset` shaped JSON payload that the Stage 1 intake form
 * drops directly into `RawIntake.images` / `.videos` / `.files`.
 *
 * Notes
 * ─────
 * • This is a local-dev implementation. Swap the disk writer for S3 presign
 *   once the MAAS platform has blob storage.
 * • Image dimensions are probed with the tiny dependency-free `imageProbe`
 *   helper. Video duration / width / height / fps / codec are probed by the
 *   equally dependency-free `videoProbe` (mp4 atom box reader, supports
 *   mp4 / mov / m4v; webm and other containers return undefined and the
 *   validator falls back to info-level "missing-required-field").
 * • Size limit: 50 MB by default, configurable via `MAX_UPLOAD_BYTES` env.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { probeImage } from '@/lib/imageProbe'
import { probeVideo } from '@/lib/videoProbe'
import type { UploadedAsset, UploadedAssetValidation } from '@/lib/briefTypes'
import {
  validateAssetAgainstSpecs,
  type ProducedAsset,
} from '@/lib/specValidator'
import { findSpecById, type AssetSpec } from '@/lib/assetSpecs'

export const runtime = 'nodejs'

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024 // 50 MB

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'application/pdf']

function extFromName(name: string | undefined, mime: string): string {
  if (name && name.includes('.')) {
    const tail = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    if (/^[a-z0-9]{1,8}$/.test(tail)) return tail
  }
  // Fallback: guess from mime
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
  }
  return map[mime] || 'bin'
}

function yyyymmdd(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch (err) {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 })
  }

  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES) || DEFAULT_MAX_BYTES
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: 'file_too_large', limitBytes: maxBytes },
      { status: 413 },
    )
  }

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json(
      { error: 'unsupported_mime', mime },
      { status: 415 },
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // Build destination path — use public/uploads so Next serves it directly.
  const id = randomUUID()
  const ext = extFromName(file.name, mime)
  const dateDir = yyyymmdd()
  const relDir = path.join('public', 'uploads', dateDir)
  const absDir = path.join(process.cwd(), relDir)
  await fs.mkdir(absDir, { recursive: true })

  const filename = `${id}.${ext}`
  const absPath = path.join(absDir, filename)
  await fs.writeFile(absPath, bytes)

  const publicUrl = `/uploads/${dateDir}/${filename}`

  // Populate dimensions / duration / fps for images and videos if we can.
  let width: number | undefined
  let height: number | undefined
  let durationSec: number | undefined
  let fps: number | undefined
  let codec: string | undefined
  if (mime.startsWith('image/')) {
    const probed = probeImage(bytes.subarray(0, Math.min(bytes.length, 65536)))
    if (probed) {
      width = probed.width
      height = probed.height
    }
  } else if (mime.startsWith('video/')) {
    // Read up to first 4 MB — moov is normally either right after ftyp
    // (fast-start mp4) or at the very tail. For non-fast-start files we need
    // a heuristic: try the head first, and if that fails, also try the tail.
    const headSlice = bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024))
    let probed = probeVideo(headSlice, mime)
    // If head probe found ftyp but no moov (durationSec undefined and no
    // video track), retry with the full buffer — moov is at the tail.
    if (probed && !probed.hasVideoTrack && probed.durationSec === undefined) {
      probed = probeVideo(bytes, mime)
    }
    if (probed) {
      width = probed.width
      height = probed.height
      durationSec = probed.durationSec
      fps = probed.fps
      codec = probed.codec
    }
  }

  // ── Optional spec validation ────────────────────────────────────────────
  // Caller can pass `specIds=ig-reel,tiktok-video` (comma list) in the
  // multipart form. If we have enough info to validate (width/height present
  // for images), we run it inline so the response carries the verdict.
  // For videos we can't probe duration without ffprobe, so the validator
  // simply marks duration as missing — that surfaces as an info, not a
  // blocker, which is the correct ADL-friendly behavior.
  let validations: UploadedAssetValidation[] | undefined
  const specIdsRaw = form.get('specIds')
  if (typeof specIdsRaw === 'string' && specIdsRaw.trim()) {
    const ids = specIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
    const specs: AssetSpec[] = []
    for (const sid of ids) {
      const s = findSpecById(sid)
      if (s) specs.push(s)
    }
    if (specs.length > 0 && width !== undefined && height !== undefined) {
      const produced: ProducedAsset = {
        width,
        height,
        mediaType: mime.startsWith('video/') ? 'video' : 'image',
        format: mime,
        fileSizeMB: file.size / (1024 * 1024),
        ...(durationSec !== undefined ? { durationSec } : {}),
        ...(fps !== undefined ? { fps } : {}),
      }
      if (produced.width > 0 && produced.height > 0) {
        const reports = validateAssetAgainstSpecs(produced, specs)
        validations = reports.map((r) => ({
          specId: r.specId,
          score: r.score,
          ok: r.ok,
          blockers: r.blockers,
          warnings: r.warnings,
          infos: r.infos,
          summary: r.summary,
        }))
      }
    }
  }

  const asset: UploadedAsset = {
    id,
    url: publicUrl,
    mime,
    filename: file.name,
    size: file.size,
    width,
    height,
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(fps !== undefined ? { fps } : {}),
    ...(codec !== undefined ? { codec } : {}),
    ...(validations ? { validations } : {}),
  }

  return NextResponse.json({ asset })
}

export async function GET() {
  return NextResponse.json(
    {
      usage:
        'POST multipart/form-data with a "file" field. Returns { asset: UploadedAsset }.',
      maxBytes: Number(process.env.MAX_UPLOAD_BYTES) || DEFAULT_MAX_BYTES,
      accepted: ALLOWED_MIME_PREFIXES,
    },
    { status: 200 },
  )
}
