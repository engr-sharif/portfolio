import exifr from 'exifr';

/**
 * Client-side image pipeline for Studio uploads. Runs in the browser before a
 * photo is committed to the repo:
 *   1. Read EXIF GPS + capture date FIRST (canvas re-encoding strips metadata,
 *      so we extract it up front — this is what feeds the location map).
 *   2. HEIC/HEIF (iPhone) → JPEG so it renders on the built site.
 *   3. Downscale to a sane max edge and re-encode, honouring EXIF orientation
 *      so rotated phone shots come out upright. Astro then generates the
 *      responsive sizes at build time from this high-quality source.
 * Non-images (PDFs) and vector/animated formats (SVG/GIF) pass through.
 */
const MAX_EDGE = 2400;       // longest side; ample for retina portfolio display
const JPEG_QUALITY = 0.85;   // visually lossless-ish, big file savings

export interface ImageMeta { lat?: number; lng?: number; takenAt?: string }
export interface Processed { file: File; meta: ImageMeta }

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
const isImage = (f: File) => f.type.startsWith('image/') || isHeic(f);
const canResize = (f: File) =>
  isImage(f) && !/svg|gif/i.test(f.type) && !/\.(svg|gif)$/i.test(f.name);

async function readMeta(file: File): Promise<ImageMeta> {
  const meta: ImageMeta = {};
  if (!isImage(file)) return meta;
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      meta.lat = +gps.latitude.toFixed(6);
      meta.lng = +gps.longitude.toFixed(6);
    }
  } catch { /* no GPS — fine */ }
  try {
    const d = await exifr.parse(file, ['DateTimeOriginal']);
    const dt = d?.DateTimeOriginal;
    if (dt instanceof Date && !isNaN(dt.getTime())) meta.takenAt = dt.toISOString().slice(0, 10);
  } catch { /* no date — fine */ }
  return meta;
}

export async function processImage(file: File): Promise<Processed> {
  const meta = await readMeta(file);
  if (!canResize(file)) return { file, meta };

  let source: Blob = file;
  let name = file.name;

  if (isHeic(file)) {
    try {
      const heic2any = (await import('heic2any')).default as any;
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY });
      source = Array.isArray(out) ? out[0] : out;
      name = name.replace(/\.(heic|heif)$/i, '.jpg');
    } catch {
      return { file, meta }; // conversion failed — upload original rather than block
    }
  }

  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / longest);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file: new File([source], name, { type: source.type || 'image/jpeg' }), meta };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    // Keep PNG (transparency); everything else → JPEG.
    const keepPng = /image\/png/i.test(source.type) || /\.png$/i.test(name);
    const type = keepPng ? 'image/png' : 'image/jpeg';
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, JPEG_QUALITY),
    );
    if (!keepPng) name = name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([blob], name, { type }), meta };
  } catch {
    return { file: new File([source], name, { type: source.type || 'image/jpeg' }), meta };
  }
}
