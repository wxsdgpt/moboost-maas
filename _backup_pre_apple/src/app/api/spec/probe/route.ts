/**
 * POST /api/spec/probe
 * ============================================================================
 * Stateless probe endpoint. Takes a multipart upload with a `file` field,
 * runs the zero-dependency `imageProbe` / `videoProbe` against it, and
 * returns the extracted metadata WITHOUT saving the file anywhere.
 *
 * Designed for the /specs/inspector page so xu can drop a real mp4 / png
 * and immediately see what the spec validator sees, without leaving uploads
 * lying around in `public/uploads/`.
 *
 * Why a separate route from /api/upload?
 * --------------------------------------
 *  • /api/upload writes to disk and returns a public URL — overkill for
 *    "tell me what's in this file"
 *  • Avoids growing /uploads on every inspector click
 *  • Makes the probe layer independently testable from the storage layer
 *
 * Returns:
 * {
 *   ok: true,
 *   probe: {
 *     mediaType: 'image' | 'video' | 'unknown',
 *     mime: string,
 *     fileSizeMB: number,
 *     width?: number,
 *     height?: number,
 *     durationSec?: number,
 *     fps?: number,
 *     codec?: string,
 *     brand?: string,
 *     hasVideoTrack?: boolean,
 *   }
 * }
 *
 * The shape is deliberately compatible with the ProducedAsset interface so
 * the inspector page can spread the result straight into its form state.
 */
import { NextRequest, NextResponse } from 'next/server'
import { probeImage } from '@/lib/imageProbe'
import { probeVideo, type VideoMetadata } from '@/lib/videoProbe'

export const runtime = 'nodejs'

const MAX_BYTES = 50 * 1024 * 1024

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form_data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: 'file_too_large', limitBytes: MAX_BYTES },
      { status: 413 },
    )
  }

  const mime = file.type || 'application/octet-stream'
  const bytes = Buffer.from(await file.arrayBuffer())
  const fileSizeMB = round3(file.size / (1024 * 1024))

  if (mime.startsWith('image/')) {
    const probed = probeImage(bytes.subarray(0, Math.min(bytes.length, 65536)))
    return NextResponse.json({
      ok: true,
      probe: {
        mediaType: 'image' as const,
        mime,
        fileSizeMB,
        width: probed?.width,
        height: probed?.height,
      },
    })
  }

  if (mime.startsWith('video/')) {
    // Probe head first; fall back to full buffer if moov is at the tail.
    const headSlice = bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024))
    let probed: VideoMetadata | null = probeVideo(headSlice, mime)
    if (probed && !probed.hasVideoTrack && probed.durationSec === undefined) {
      probed = probeVideo(bytes, mime)
    }
    return NextResponse.json({
      ok: true,
      probe: {
        mediaType: 'video' as const,
        mime,
        fileSizeMB,
        width: probed?.width,
        height: probed?.height,
        durationSec: probed?.durationSec,
        fps: probed?.fps,
        codec: probed?.codec,
        brand: probed?.brand,
        hasVideoTrack: probed?.hasVideoTrack,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    probe: {
      mediaType: 'unknown' as const,
      mime,
      fileSizeMB,
    },
  })
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export async function GET() {
  return NextResponse.json({
    usage:
      'POST multipart/form-data with a "file" field. Returns { probe } with width/height/duration/fps/codec for images or videos. Does not persist the file.',
    maxBytes: MAX_BYTES,
  })
}
