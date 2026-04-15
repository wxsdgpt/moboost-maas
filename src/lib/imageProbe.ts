/**
 * Tiny, dependency-free image dimension probe.
 *
 * Supports:
 *   PNG   — reads IHDR chunk
 *   JPEG  — walks segments until SOF0/SOF2
 *   GIF   — reads logical screen descriptor
 *   WEBP  — VP8 / VP8L / VP8X
 *
 * Returns `null` when the format is unknown or the buffer is truncated.
 * Only the first ~64 KB of the file is needed for any of the above formats,
 * so callers can pass a sliced `Buffer` to avoid loading the whole file.
 */
export interface ImageDimensions {
  width: number
  height: number
  mime: string
}

export function probeImage(buf: Buffer): ImageDimensions | null {
  if (buf.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    // IHDR starts at byte 16 (after length+type), width=16..20, height=20..24
    if (buf.length < 24) return null
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      mime: 'image/png',
    }
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return {
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
      mime: 'image/gif',
    }
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let offset = 2
    while (offset < buf.length) {
      if (buf[offset] !== 0xff) return null
      const marker = buf[offset + 1]
      offset += 2
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 7 > buf.length) return null
        return {
          height: buf.readUInt16BE(offset + 3),
          width: buf.readUInt16BE(offset + 5),
          mime: 'image/jpeg',
        }
      }
      // Segment length follows (big-endian, includes the 2 bytes of length itself)
      if (offset + 2 > buf.length) return null
      const segLen = buf.readUInt16BE(offset)
      offset += segLen
    }
    return null
  }

  // WEBP: "RIFF"....."WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    const fourcc = buf.toString('ascii', 12, 16)
    if (fourcc === 'VP8 ' && buf.length >= 30) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
        mime: 'image/webp',
      }
    }
    if (fourcc === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21]
      const b1 = buf[22]
      const b2 = buf[23]
      const b3 = buf[24]
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        mime: 'image/webp',
      }
    }
    if (fourcc === 'VP8X' && buf.length >= 30) {
      return {
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
        mime: 'image/webp',
      }
    }
  }

  return null
}
