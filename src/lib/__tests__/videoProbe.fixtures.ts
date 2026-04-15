/**
 * videoProbe fixture tests
 * ============================================================================
 * No real mp4 binary needed — we synthesize minimal valid ISO BMFF byte
 * sequences and feed them to probeMp4(). Same coverage, full determinism,
 * zero binary blobs in the repo.
 *
 * Run with:
 *     ./node_modules/.bin/sucrase-node src/lib/__tests__/videoProbe.fixtures.ts
 *
 * Exit 0 = all pass, 1 = any failure.
 */
import { probeMp4, probeVideo } from '../videoProbe'

// ─────────────────────────────────────────────────────────────────────────────
// Mini ISO BMFF builder
// ─────────────────────────────────────────────────────────────────────────────

function box(type: string, payload: Buffer): Buffer {
  if (type.length !== 4) throw new Error('box type must be 4 chars')
  const header = Buffer.alloc(8)
  header.writeUInt32BE(payload.length + 8, 0)
  header.write(type, 4, 'ascii')
  return Buffer.concat([header, payload])
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0, 0)
  return b
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n & 0xffff, 0)
  return b
}

/** ftyp with the given major brand. */
function ftyp(brand = 'isom'): Buffer {
  return box(
    'ftyp',
    Buffer.concat([
      Buffer.from(brand.padEnd(4, ' '), 'ascii'),
      u32(512), // minor version
      Buffer.from('isomavc1mp41', 'ascii'), // compat brands
    ]),
  )
}

/** mvhd v0 with the given timescale and duration units. */
function mvhd(timescale: number, durationUnits: number): Buffer {
  return box(
    'mvhd',
    Buffer.concat([
      u32(0), // version=0 + flags
      u32(0), // creation time
      u32(0), // modification time
      u32(timescale),
      u32(durationUnits),
      // rate(4) + volume(2) + reserved(10) + matrix(36) + pre_defined(24) + nextTID(4) = 80 bytes
      Buffer.alloc(80),
    ]),
  )
}

/** tkhd v0 with the given width / height (px, will be encoded as 16.16 fixed). */
function tkhd(width: number, height: number, trackId = 1): Buffer {
  return box(
    'tkhd',
    Buffer.concat([
      u32(0x00000007), // version=0 + flags=ENABLED|IN_MOVIE|IN_PREVIEW
      u32(0), // ctime
      u32(0), // mtime
      u32(trackId),
      u32(0), // reserved
      u32(0), // duration
      Buffer.alloc(8), // reserved
      u16(0), // layer
      u16(0), // alt group
      u16(0), // volume
      u16(0), // reserved
      Buffer.alloc(36), // matrix
      u32(width * 65536), // width 16.16
      u32(height * 65536), // height 16.16
    ]),
  )
}

/** mdhd v0 with the given media timescale + duration units. */
function mdhd(timescale: number, durationUnits: number): Buffer {
  return box(
    'mdhd',
    Buffer.concat([
      u32(0), // v + flags
      u32(0), // ctime
      u32(0), // mtime
      u32(timescale),
      u32(durationUnits),
      u16(0), // language
      u16(0), // pre_defined
    ]),
  )
}

/** hdlr declaring this track as video ('vide') or sound ('soun'). */
function hdlr(handlerType: 'vide' | 'soun'): Buffer {
  return box(
    'hdlr',
    Buffer.concat([
      u32(0), // v + flags
      u32(0), // pre_defined
      Buffer.from(handlerType, 'ascii'),
      Buffer.alloc(12), // reserved
      Buffer.from('test\0', 'ascii'), // name
    ]),
  )
}

/** stsd with a single sample entry of the given fourcc (codec id). */
function stsd(codec: string): Buffer {
  // Sample entry: size(4) + type(4) + reserved(6) + data_ref_index(2) +
  //   for video: pre_defined(2) + reserved(2) + pre_defined(12) + width(2) + height(2) + ...
  // We don't need it to be a valid VisualSampleEntry — probe only reads the
  // first 8 bytes (size + type), so a minimal stub works.
  const entry = Buffer.concat([
    u32(16), // entry size: header(8) + reserved(6) + dri(2) = 16
    Buffer.from(codec.padEnd(4, ' ').slice(0, 4), 'ascii'),
    Buffer.alloc(6), // reserved
    u16(1), // data reference index
  ])
  return box(
    'stsd',
    Buffer.concat([
      u32(0), // v + flags
      u32(1), // entry count
      entry,
    ]),
  )
}

/** stts with one (sample_count, sample_delta) entry. */
function stts(sampleCount: number, sampleDelta: number): Buffer {
  return box(
    'stts',
    Buffer.concat([
      u32(0), // v + flags
      u32(1), // entry count
      u32(sampleCount),
      u32(sampleDelta),
    ]),
  )
}

/** Build a complete trak box with optional codec / sample count. */
function trak(opts: {
  width: number
  height: number
  mediaTimescale: number
  mediaDurationUnits: number
  isVideo?: boolean
  codec?: string
  sampleCount?: number
  sampleDelta?: number
}): Buffer {
  const isVideo = opts.isVideo !== false
  const sampleEntries: Buffer[] = []
  if (opts.codec) sampleEntries.push(stsd(opts.codec))
  if (opts.sampleCount !== undefined && opts.sampleDelta !== undefined) {
    sampleEntries.push(stts(opts.sampleCount, opts.sampleDelta))
  }
  const stbl = box('stbl', Buffer.concat(sampleEntries))
  const minf = box('minf', stbl)
  const mdia = box(
    'mdia',
    Buffer.concat([
      mdhd(opts.mediaTimescale, opts.mediaDurationUnits),
      hdlr(isVideo ? 'vide' : 'soun'),
      minf,
    ]),
  )
  return box(
    'trak',
    Buffer.concat([tkhd(opts.width, opts.height), mdia]),
  )
}

/** Build a complete moov containing mvhd + the given traks. */
function moov(
  movTimescale: number,
  movDurationUnits: number,
  traks: Buffer[],
): Buffer {
  return box('moov', Buffer.concat([mvhd(movTimescale, movDurationUnits), ...traks]))
}

/** Full mp4: ftyp + moov. */
function mp4File(brand: string, moovBuf: Buffer): Buffer {
  return Buffer.concat([ftyp(brand), moovBuf])
}

// ─────────────────────────────────────────────────────────────────────────────
// Test driver
// ─────────────────────────────────────────────────────────────────────────────

interface Case {
  name: string
  run: () => boolean | string // true | false | failure-message
}

const cases: Case[] = [
  {
    name: '1080×1920 30fps 30s mp4 (ig-reel shape)',
    run: () => {
      const file = mp4File(
        'mp42',
        moov(1000, 30000, [
          trak({
            width: 1080,
            height: 1920,
            mediaTimescale: 30000,
            mediaDurationUnits: 900000,
            codec: 'avc1',
            sampleCount: 900,
            sampleDelta: 1000,
          }),
        ]),
      )
      const m = probeMp4(file)
      if (!m) return 'probe returned null'
      if (m.width !== 1080 || m.height !== 1920) return `dims wrong: ${m.width}x${m.height}`
      if (Math.abs((m.durationSec ?? 0) - 30) > 0.01) return `duration wrong: ${m.durationSec}`
      if (Math.abs((m.fps ?? 0) - 30) > 0.1) return `fps wrong: ${m.fps}`
      if (m.codec !== 'avc1') return `codec wrong: ${m.codec}`
      if (m.brand !== 'mp42') return `brand wrong: ${m.brand}`
      if (!m.hasVideoTrack) return 'hasVideoTrack false'
      return true
    },
  },
  {
    name: '4K 60fps mp4',
    run: () => {
      const file = mp4File(
        'isom',
        moov(600, 6000, [
          trak({
            width: 3840,
            height: 2160,
            mediaTimescale: 60000,
            mediaDurationUnits: 600000,
            codec: 'hvc1',
            sampleCount: 600,
            sampleDelta: 1000,
          }),
        ]),
      )
      const m = probeMp4(file)!
      if (m.width !== 3840 || m.height !== 2160) return `dims: ${m.width}x${m.height}`
      if (Math.abs((m.durationSec ?? 0) - 10) > 0.01) return `dur: ${m.durationSec}`
      if (Math.abs((m.fps ?? 0) - 60) > 0.1) return `fps: ${m.fps}`
      if (m.codec !== 'hvc1') return `codec: ${m.codec}`
      return true
    },
  },
  {
    name: 'square 1080 24fps short clip',
    run: () => {
      const file = mp4File(
        'isom',
        moov(1000, 5000, [
          trak({
            width: 1080,
            height: 1080,
            mediaTimescale: 24000,
            mediaDurationUnits: 120000,
            codec: 'avc1',
            sampleCount: 120,
            sampleDelta: 1000,
          }),
        ]),
      )
      const m = probeMp4(file)!
      if (m.width !== 1080 || m.height !== 1080) return `dims: ${m.width}x${m.height}`
      if (Math.abs((m.durationSec ?? 0) - 5) > 0.01) return `dur: ${m.durationSec}`
      if (Math.abs((m.fps ?? 0) - 24) > 0.1) return `fps: ${m.fps}`
      return true
    },
  },
  {
    name: 'audio-only mp4 → durationSec but no width/height/track',
    run: () => {
      const file = mp4File(
        'M4A ',
        moov(48000, 480000, [
          trak({
            width: 0,
            height: 0,
            mediaTimescale: 48000,
            mediaDurationUnits: 480000,
            isVideo: false,
            codec: 'mp4a',
          }),
        ]),
      )
      const m = probeMp4(file)!
      if (m.width !== undefined) return `unexpected width: ${m.width}`
      if (m.hasVideoTrack) return 'should not have video track'
      if (Math.abs((m.durationSec ?? 0) - 10) > 0.01) return `dur: ${m.durationSec}`
      return true
    },
  },
  {
    name: 'multi-track: audio first, video second → still finds video dims',
    run: () => {
      const file = mp4File(
        'isom',
        moov(1000, 15000, [
          trak({
            width: 0,
            height: 0,
            mediaTimescale: 48000,
            mediaDurationUnits: 720000,
            isVideo: false,
            codec: 'mp4a',
          }),
          trak({
            width: 1920,
            height: 1080,
            mediaTimescale: 30000,
            mediaDurationUnits: 450000,
            codec: 'avc1',
            sampleCount: 450,
            sampleDelta: 1000,
          }),
        ]),
      )
      const m = probeMp4(file)!
      if (m.width !== 1920 || m.height !== 1080) return `dims: ${m.width}x${m.height}`
      if (Math.abs((m.durationSec ?? 0) - 15) > 0.01) return `dur: ${m.durationSec}`
      if (m.codec !== 'avc1') return `codec: ${m.codec}`
      if (!m.hasVideoTrack) return 'hasVideoTrack false'
      return true
    },
  },
  {
    name: 'fractional 29.97 fps survives round-trip',
    run: () => {
      // 30000/1001 timescale, 30030 sample delta → exactly 29.97
      const file = mp4File(
        'mp42',
        moov(1000, 10000, [
          trak({
            width: 1920,
            height: 1080,
            mediaTimescale: 30000,
            mediaDurationUnits: 300000,
            codec: 'avc1',
            sampleCount: 299, // ~29.9 fps over 10s
            sampleDelta: 1001,
          }),
        ]),
      )
      const m = probeMp4(file)!
      if (Math.abs((m.fps ?? 0) - 29.9) > 0.2) return `fps off: ${m.fps}`
      return true
    },
  },
  {
    name: 'no ftyp → null',
    run: () => {
      const fake = Buffer.alloc(64)
      fake.write('garbage stuff here', 0)
      const m = probeMp4(fake)
      return m === null ? true : 'should have returned null'
    },
  },
  {
    name: 'ftyp but no moov → returns brand only',
    run: () => {
      const file = ftyp('mp42')
      const m = probeMp4(file)!
      if (!m) return 'should not be null'
      if (m.brand !== 'mp42') return `brand: ${m.brand}`
      if (m.hasVideoTrack) return 'should be false'
      if (m.durationSec !== undefined) return 'should not have duration'
      return true
    },
  },
  {
    name: 'moov with mvhd v1 (64-bit duration)',
    run: () => {
      // build mvhd v1 by hand
      const mvhdV1 = box(
        'mvhd',
        Buffer.concat([
          u32(0x01000000), // version=1
          Buffer.alloc(8), // ctime 64
          Buffer.alloc(8), // mtime 64
          u32(1000), // timescale
          u32(0), // dur high
          u32(60000), // dur low → 60s
          Buffer.alloc(80),
        ]),
      )
      const m = probeMp4(
        Buffer.concat([
          ftyp('isom'),
          box('moov', Buffer.concat([mvhdV1])),
        ]),
      )!
      if (Math.abs((m.durationSec ?? 0) - 60) > 0.01) return `dur: ${m.durationSec}`
      return true
    },
  },
  {
    name: 'truncated buffer (only first 32 bytes of valid file)',
    run: () => {
      const file = mp4File(
        'isom',
        moov(1000, 30000, [
          trak({
            width: 1080,
            height: 1920,
            mediaTimescale: 30000,
            mediaDurationUnits: 900000,
            codec: 'avc1',
            sampleCount: 900,
            sampleDelta: 1000,
          }),
        ]),
      )
      const truncated = file.subarray(0, 32)
      // Should not throw. Should return null or partial.
      let threw = false
      try {
        probeMp4(truncated)
      } catch (e) {
        threw = true
      }
      return threw ? 'threw on truncated input' : true
    },
  },
  {
    name: 'probeVideo dispatches mp4 mime',
    run: () => {
      const file = mp4File(
        'mp42',
        moov(1000, 30000, [
          trak({
            width: 1080,
            height: 1920,
            mediaTimescale: 30000,
            mediaDurationUnits: 900000,
            codec: 'avc1',
            sampleCount: 900,
            sampleDelta: 1000,
          }),
        ]),
      )
      const m = probeVideo(file, 'video/mp4')
      if (!m || m.width !== 1080) return 'dispatch failed'
      const m2 = probeVideo(file, 'video/quicktime')
      if (!m2 || m2.width !== 1080) return 'mov dispatch failed'
      const m3 = probeVideo(file, 'video/webm')
      // webm not supported BUT we still sniff ftyp; should still return data
      if (!m3 || m3.width !== 1080) return 'ftyp sniff fallback failed'
      return true
    },
  },
  {
    name: 'probeVideo returns null for non-mp4 webm-shaped buffer',
    run: () => {
      const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00])
      const m = probeVideo(ebml, 'video/webm')
      return m === null ? true : 'should be null for non-mp4'
    },
  },
]

let passed = 0
let failed = 0
for (const c of cases) {
  let result: boolean | string
  try {
    result = c.run()
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
process.exit(failed === 0 ? 0 : 1)
