/**
 * videoProbe — zero-dependency MP4 / MOV / M4V metadata reader
 * ============================================================================
 *
 * Walks the ISO Base Media File Format (ISO/IEC 14496-12) box tree directly
 * out of a `Buffer` and pulls out the bits the Spec Validator actually needs:
 *
 *   • durationSec   — from `moov/mvhd`
 *   • width/height  — from the first non-zero `moov/trak/tkhd`
 *   • fps           — from `moov/trak/mdia/minf/stbl/stts` ÷ duration
 *   • codec         — fourcc of the first sample entry under
 *                     `moov/trak/mdia/minf/stbl/stsd`  (e.g. avc1, hvc1, av01)
 *
 * Why hand-roll this?
 * -------------------
 *  ADL: stability > novelty. We refuse to add ffprobe / @ffmpeg-installer /
 *  mp4box.js / fluent-ffmpeg as a dependency just to read four numbers. The
 *  K1 (Spec Validator) cycle established the principle that anything that
 *  runs on every upload must be a pure function with no shell-out, no
 *  network, no state. This file extends that principle to video.
 *
 * What it does NOT do
 * -------------------
 *  • WebM / Matroska (EBML) — totally different container format. Document
 *    that limitation in `validateVideoFile()` and return null.
 *  • HLS / DASH manifests
 *  • Encrypted (cenc) sample entries are still parsed for size, just not
 *    decoded
 *  • Audio-only streams (we still return durationSec but width/height stay
 *    undefined)
 *
 * Invariants
 * ----------
 *  • Pure function. Same buffer in → same record out, forever.
 *  • Never throws on malformed input. Returns `null` or partial record.
 *  • Reads at most the bytes the buffer already has. Caller is in control
 *    of slicing / streaming.
 *
 * Usage
 * -----
 *     import { probeMp4 } from './videoProbe'
 *     const meta = probeMp4(buf)   // null if not a recognised mp4
 *     if (meta) console.log(meta.durationSec, meta.width, meta.height)
 *
 * The output integrates directly into ProducedAsset for the Spec Validator:
 *
 *     const produced: ProducedAsset = {
 *       width: meta.width ?? 0,
 *       height: meta.height ?? 0,
 *       mediaType: 'video',
 *       durationSec: meta.durationSec,
 *       fps: meta.fps,
 *       format: 'mp4',
 *       fileSizeMB: file.size / (1024 * 1024),
 *     }
 */

export interface VideoMetadata {
  /** Duration in seconds (float). Undefined if mvhd was unreadable. */
  durationSec?: number
  /** Display width in pixels (integer). Undefined if no video track found. */
  width?: number
  /** Display height in pixels (integer). Undefined if no video track found. */
  height?: number
  /** Frames per second (float, ≈ 23.976 / 25 / 29.97 / 30 / 60 …). */
  fps?: number
  /** First sample entry fourcc (e.g. "avc1", "hvc1", "av01", "vp09"). */
  codec?: string
  /** Container brand (e.g. "isom", "mp42", "qt  "). */
  brand?: string
  /** True iff at least one video track was located. */
  hasVideoTrack: boolean
}

interface BoxHeader {
  /** Total box length including the header itself. 0 = "to end of file". */
  size: number
  /** 4-char box type, e.g. "moov", "mvhd". */
  type: string
  /** Offset of the first byte AFTER the header (where payload starts). */
  payloadStart: number
}

/**
 * Read the ISO BMFF box header at `offset`. Handles 32-bit and 64-bit (largesize)
 * length forms. Returns null if the buffer is too short.
 */
function readBoxHeader(buf: Buffer, offset: number): BoxHeader | null {
  if (offset + 8 > buf.length) return null
  const size32 = buf.readUInt32BE(offset)
  const type = buf.toString('ascii', offset + 4, offset + 8)
  if (size32 === 1) {
    // 64-bit largesize follows the type
    if (offset + 16 > buf.length) return null
    const hi = buf.readUInt32BE(offset + 8)
    const lo = buf.readUInt32BE(offset + 12)
    // JS bitwise ops are 32-bit, so do the math in float (safe up to 2^53)
    const size = hi * 0x100000000 + lo
    return { size, type, payloadStart: offset + 16 }
  }
  if (size32 === 0) {
    // "to end of file"
    return { size: buf.length - offset, type, payloadStart: offset + 8 }
  }
  return { size: size32, type, payloadStart: offset + 8 }
}

/**
 * Iterate every direct child box of the container that lives between
 * [start, end). Calls `visit(header, payloadEnd)`. Stops if visit returns
 * `false`.
 *
 * `payloadEnd` is the index of the byte just past this box's payload, i.e.
 * the start of the next sibling.
 */
function walkBoxes(
  buf: Buffer,
  start: number,
  end: number,
  visit: (h: BoxHeader, payloadEnd: number) => boolean | void,
): void {
  let cursor = start
  while (cursor + 8 <= end) {
    const h = readBoxHeader(buf, cursor)
    if (!h) return
    if (h.size < 8) return // malformed, abort
    const next = cursor + h.size
    if (next > end || next < cursor) return // overflow / truncated
    const cont = visit(h, next)
    if (cont === false) return
    cursor = next
  }
}

/**
 * Parse `mvhd` (movie header) payload. Returns { timescale, durationUnits } or
 * null on truncation. Handles both version 0 (32-bit times) and version 1
 * (64-bit times).
 *
 * Layout v0 (after the 4 byte version+flags header):
 *   creation_time(4) modification_time(4) timescale(4) duration(4) ...
 * Layout v1:
 *   creation_time(8) modification_time(8) timescale(4) duration(8) ...
 */
function parseMvhd(
  buf: Buffer,
  payloadStart: number,
  payloadEnd: number,
): { timescale: number; durationUnits: number } | null {
  if (payloadEnd - payloadStart < 24) return null
  const version = buf[payloadStart]
  if (version === 1) {
    if (payloadEnd - payloadStart < 32) return null
    const timescale = buf.readUInt32BE(payloadStart + 20)
    const durHi = buf.readUInt32BE(payloadStart + 24)
    const durLo = buf.readUInt32BE(payloadStart + 28)
    const durationUnits = durHi * 0x100000000 + durLo
    return { timescale, durationUnits }
  }
  // version 0 (or unknown — fall through and try v0 layout)
  const timescale = buf.readUInt32BE(payloadStart + 12)
  const durationUnits = buf.readUInt32BE(payloadStart + 16)
  return { timescale, durationUnits }
}

/**
 * Parse `tkhd` (track header) payload. Returns width/height as integers (the
 * box stores them as 16.16 fixed-point in the LAST 8 bytes regardless of
 * version). Returns null if width or height is 0 (audio track) or buffer
 * truncated.
 *
 * Layout v0 (28 bytes of "early" fields + matrix(36) + width(4) + height(4)):
 *   v+flags(4) ctime(4) mtime(4) trackID(4) reserved(4) duration(4)
 *   reserved(8) layer(2) altGroup(2) volume(2) reserved(2) matrix(36)
 *   width(4) height(4)
 * Layout v1 grows the time fields to 8 bytes each.
 */
function parseTkhd(
  buf: Buffer,
  payloadStart: number,
  payloadEnd: number,
): { width: number; height: number } | null {
  const version = buf[payloadStart]
  // total size: v+flags(4) + (v==1 ? 8+8+4+4+8 : 4+4+4+4+4) + 8 reserved
  //           + 2 layer + 2 altGroup + 2 volume + 2 reserved + 36 matrix
  //           + 4 width + 4 height
  const required = version === 1 ? 96 : 84
  if (payloadEnd - payloadStart < required) return null
  // width/height are the LAST 8 bytes, fixed-point 16.16 BE
  const wRaw = buf.readUInt32BE(payloadEnd - 8)
  const hRaw = buf.readUInt32BE(payloadEnd - 4)
  const width = Math.round(wRaw / 65536)
  const height = Math.round(hRaw / 65536)
  if (width === 0 || height === 0) return null
  return { width, height }
}

/**
 * Parse `mdhd` (media header). Returns { timescale, durationUnits } for THIS
 * track's media timeline (which is what stts samples are measured in).
 */
function parseMdhd(
  buf: Buffer,
  payloadStart: number,
  payloadEnd: number,
): { timescale: number; durationUnits: number } | null {
  if (payloadEnd - payloadStart < 24) return null
  const version = buf[payloadStart]
  if (version === 1) {
    if (payloadEnd - payloadStart < 32) return null
    const timescale = buf.readUInt32BE(payloadStart + 20)
    const durHi = buf.readUInt32BE(payloadStart + 24)
    const durLo = buf.readUInt32BE(payloadStart + 28)
    return { timescale, durationUnits: durHi * 0x100000000 + durLo }
  }
  const timescale = buf.readUInt32BE(payloadStart + 12)
  const durationUnits = buf.readUInt32BE(payloadStart + 16)
  return { timescale, durationUnits }
}

/**
 * Parse `hdlr` to find out whether this is a video track. Returns true iff
 * handler_type == "vide".
 */
function isVideoHandler(
  buf: Buffer,
  payloadStart: number,
  payloadEnd: number,
): boolean {
  // v+flags(4) pre_defined(4) handler_type(4) ...
  if (payloadEnd - payloadStart < 12) return false
  return buf.toString('ascii', payloadStart + 8, payloadStart + 12) === 'vide'
}

/**
 * Parse `stsd` (sample description) and return the fourcc of the first sample
 * entry. For video tracks this is the codec id (avc1, hvc1, hev1, vp09, av01,
 * mp4v…).
 *
 * Layout: v+flags(4) entry_count(4) [ entry_size(4) entry_type(4) ... ]
 */
function parseStsdCodec(
  buf: Buffer,
  payloadStart: number,
  payloadEnd: number,
): string | null {
  if (payloadEnd - payloadStart < 16) return null
  const entryCount = buf.readUInt32BE(payloadStart + 4)
  if (entryCount === 0) return null
  const firstEntry = payloadStart + 8
  if (firstEntry + 8 > payloadEnd) return null
  return buf.toString('ascii', firstEntry + 4, firstEntry + 8)
}

/**
 * Parse `stts` (decoding time-to-sample) and return the total sample count.
 * Combined with media duration this gives an accurate fps.
 *
 * Layout: v+flags(4) entry_count(4) [ sample_count(4) sample_delta(4) ]*N
 */
function parseSttsSampleCount(
  buf: Buffer,
  payloadStart: number,
  payloadEnd: number,
): number | null {
  if (payloadEnd - payloadStart < 8) return null
  const entryCount = buf.readUInt32BE(payloadStart + 4)
  let total = 0
  let cursor = payloadStart + 8
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 8 > payloadEnd) return null
    total += buf.readUInt32BE(cursor)
    cursor += 8
  }
  return total
}

/**
 * Top-level entry point. Returns null if `buf` does not look like an ISO BMFF
 * file (no `ftyp` box at the head, or no `moov` anywhere).
 */
export function probeMp4(buf: Buffer): VideoMetadata | null {
  if (buf.length < 16) return null

  // First box must be ftyp for it to be a recognisable mp4/mov family file.
  const head = readBoxHeader(buf, 0)
  if (!head || head.type !== 'ftyp') return null
  let brand: string | undefined
  if (head.payloadStart + 4 <= buf.length) {
    brand = buf.toString('ascii', head.payloadStart, head.payloadStart + 4)
  }

  // Find moov by walking top-level boxes. moov is usually after ftyp+mdat,
  // but in fast-start ("moov first") files it can be right after ftyp.
  let moov: { payloadStart: number; payloadEnd: number } | null = null
  walkBoxes(buf, 0, buf.length, (h, end) => {
    if (h.type === 'moov') {
      moov = { payloadStart: h.payloadStart, payloadEnd: end }
      return false
    }
  })
  if (!moov) {
    // Found ftyp but no moov in the buffer. Caller probably gave us the head
    // of a streaming file with moov at the tail — return what we have.
    return {
      hasVideoTrack: false,
      brand,
    }
  }

  // Capture the bounds in plain locals so TS knows they're non-null inside
  // the closures below — narrow type inference doesn't reach into nested
  // arrow functions for object fields.
  const moovStart: number = (moov as { payloadStart: number; payloadEnd: number }).payloadStart
  const moovEnd: number = (moov as { payloadStart: number; payloadEnd: number }).payloadEnd

  // ── mvhd: file-level duration ─────────────────────────────────────────────
  let movieTimescale: number | undefined
  let movieDurationUnits: number | undefined
  walkBoxes(buf, moovStart, moovEnd, (h, end) => {
    if (h.type === 'mvhd') {
      const r = parseMvhd(buf, h.payloadStart, end)
      if (r) {
        movieTimescale = r.timescale
        movieDurationUnits = r.durationUnits
      }
      return false
    }
  })

  // ── walk every trak; pick first VIDEO track for width/height/fps/codec ───
  let videoWidth: number | undefined
  let videoHeight: number | undefined
  let videoFps: number | undefined
  let videoCodec: string | undefined
  let hasVideoTrack = false

  walkBoxes(buf, moovStart, moovEnd, (h, end) => {
    if (h.type !== 'trak') return
    // Inside this trak, find: tkhd (dims), mdia → mdhd (track timescale),
    // mdia → hdlr (is it video?), mdia → minf → stbl → stsd (codec) + stts (sample count).
    let isVideo = false
    let trackWidth: number | undefined
    let trackHeight: number | undefined
    let trackTimescale: number | undefined
    let trackDurationUnits: number | undefined
    let codec: string | undefined
    let sampleCount: number | undefined

    walkBoxes(buf, h.payloadStart, end, (c, cEnd) => {
      if (c.type === 'tkhd') {
        const dims = parseTkhd(buf, c.payloadStart, cEnd)
        if (dims) {
          trackWidth = dims.width
          trackHeight = dims.height
        }
      } else if (c.type === 'mdia') {
        walkBoxes(buf, c.payloadStart, cEnd, (m, mEnd) => {
          if (m.type === 'mdhd') {
            const r = parseMdhd(buf, m.payloadStart, mEnd)
            if (r) {
              trackTimescale = r.timescale
              trackDurationUnits = r.durationUnits
            }
          } else if (m.type === 'hdlr') {
            isVideo = isVideoHandler(buf, m.payloadStart, mEnd)
          } else if (m.type === 'minf') {
            walkBoxes(buf, m.payloadStart, mEnd, (n, nEnd) => {
              if (n.type === 'stbl') {
                walkBoxes(buf, n.payloadStart, nEnd, (s, sEnd) => {
                  if (s.type === 'stsd') {
                    const c2 = parseStsdCodec(buf, s.payloadStart, sEnd)
                    if (c2) codec = c2
                  } else if (s.type === 'stts') {
                    const sc = parseSttsSampleCount(buf, s.payloadStart, sEnd)
                    if (sc !== null) sampleCount = sc ?? undefined
                  }
                })
              }
            })
          }
        })
      }
    })

    if (isVideo) {
      hasVideoTrack = true
      if (videoWidth === undefined && trackWidth) videoWidth = trackWidth
      if (videoHeight === undefined && trackHeight) videoHeight = trackHeight
      if (videoCodec === undefined && codec) videoCodec = codec
      if (
        videoFps === undefined &&
        sampleCount &&
        trackTimescale &&
        trackDurationUnits
      ) {
        const trackDurSec = trackDurationUnits / trackTimescale
        if (trackDurSec > 0) {
          videoFps = round3(sampleCount / trackDurSec)
        }
      }
    }
  })

  const durationSec =
    movieTimescale && movieDurationUnits !== undefined && movieTimescale > 0
      ? round3(movieDurationUnits / movieTimescale)
      : undefined

  return {
    durationSec,
    width: videoWidth,
    height: videoHeight,
    fps: videoFps,
    codec: videoCodec,
    brand,
    hasVideoTrack,
  }
}

/** Round to 3 decimal places (avoids 29.970029970... noise from rationals). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: dispatch from file MIME type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to probe `buf` based on the declared mime. Currently supports
 * mp4 / quicktime / m4v. Returns null for everything else (including webm —
 * see file header comment).
 */
export function probeVideo(buf: Buffer, mime: string): VideoMetadata | null {
  const m = mime.toLowerCase()
  if (
    m === 'video/mp4' ||
    m === 'video/m4v' ||
    m === 'video/quicktime' ||
    m === 'video/x-m4v'
  ) {
    return probeMp4(buf)
  }
  // Last-ditch: maybe it's an mp4 with the wrong mime label. Sniff ftyp.
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') {
    return probeMp4(buf)
  }
  return null
}
