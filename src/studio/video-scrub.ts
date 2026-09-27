/**
 * Phone videos carry where they were shot. iPhones write an ISO 6709 string
 * ("+38.5816-121.4944+012.345/") under com.apple.quicktime.location.ISO6709;
 * Android and older iOS write a ©xyz box in the movie's user data. Photos have
 * their EXIF stripped by re-encoding; re-encoding video in the browser is slow
 * and lossy, so instead the location is blanked IN PLACE: the ©xyz box is
 * renamed "free" (which every player skips) with its payload zeroed, and any
 * ISO 6709 coordinate left in the file has its digits zeroed. Nothing moves,
 * so the file's internal offsets stay valid and it plays exactly as before.
 */

const XYZ = [0xa9, 0x78, 0x79, 0x7a]; // "©xyz"
const FREE = [0x66, 0x72, 0x65, 0x65]; // "free"
// ±DD.D… ±DDD.D… (optionally ±altitude), as ISO 6709 writes it
const ISO6709 = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[A-Z0-9_]*)?\/?/g;

/** Where the movie header ("moov") sits among the top-level boxes, if anywhere.
 * All metadata lives inside it; the frames (mdat) are never touched. */
export function findMoov(bytes: Uint8Array): { start: number; end: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (at + 8 <= bytes.length) {
    let size = dv.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    let header = 8;
    if (size === 1) { if (at + 16 > bytes.length) return null; size = Number(dv.getBigUint64(at + 8)); header = 16; }
    else if (size === 0) size = bytes.length - at;
    if (size < header) return null; // not an ISO base media file
    if (type === 'moov') return { start: at, end: Math.min(bytes.length, at + size) };
    at += size;
  }
  return null;
}

/** Blank location metadata in an MP4/MOV byte array. Returns how many were found. */
export function scrubLocation(bytes: Uint8Array): number {
  const moov = findMoov(bytes);
  if (!moov) return 0;
  let found = 0;
  // 1. ©xyz boxes: [size:4][type:4 = ©xyz][payload]
  for (let i = moov.start + 4; i <= moov.end - 4; i++) {
    if (bytes[i] !== XYZ[0] || bytes[i + 1] !== XYZ[1] || bytes[i + 2] !== XYZ[2] || bytes[i + 3] !== XYZ[3]) continue;
    const size = ((bytes[i - 4] << 24) | (bytes[i - 3] << 16) | (bytes[i - 2] << 8) | bytes[i - 1]) >>> 0;
    if (size < 8 || i - 4 + size > moov.end) continue; // not a box header
    bytes.set(FREE, i);
    bytes.fill(0, i + 4, i - 4 + size);
    found++;
  }
  // 2. Any ISO 6709 string left (QuickTime metadata keys, other boxes).
  // latin1 decodes one byte to one character, so string offsets are byte offsets
  const text = new TextDecoder('latin1').decode(bytes.subarray(moov.start, moov.end));
  for (const m of text.matchAll(ISO6709)) {
    if (!/\d{2}\.\d{2,}/.test(m[0])) continue; // needs real precision to be a position, not stray bytes
    for (let k = 0; k < m[0].length; k++) {
      const c = m[0].charCodeAt(k);
      if (c >= 0x30 && c <= 0x39) bytes[moov.start + m.index! + k] = 0x30; // digit → "0"
    }
    found++;
  }
  return found;
}

/** A copy of a video file with its location blanked (same name and type). */
export async function scrubVideo(file: File): Promise<{ file: File; found: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const found = scrubLocation(bytes);
  return { file: found ? new File([bytes], file.name, { type: file.type, lastModified: file.lastModified }) : file, found };
}
