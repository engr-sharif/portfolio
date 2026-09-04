/**
 * Social share cards — rendered at build time with satori (HTML/CSS → SVG)
 * and rasterised by sharp. Every page gets a branded Field Atlas card instead
 * of a static PNG: title, one-line summary, the mono "data voice" meta row,
 * and — when a page has a cover photo — the photo framed with the site's
 * registration-mark figure motif.
 *
 * Server-only (node:fs, sharp). Consumed by src/pages/og/[...slug].png.ts.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import satori, { type Font } from 'satori';
import sharp from 'sharp';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const INK = '#0b0d0c';
const INK_1 = '#121613';
const LINE = '#262b27';
const PAPER = '#f4f3ee';
const PAPER_SOFT = '#d6d8d1';
const MUTED = '#8a918a';
const FIELD = '#57c08a';
const FIELD_DIM = '#1d4632';
const HAZARD = '#e0a93b';

export interface CardInput {
  /** Small mono eyebrow, e.g. "PROJECT · SUPERFUND SITE" */
  eyebrow: string;
  title: string;
  summary?: string;
  /** Mono meta chips along the bottom, e.g. ["Sep 2023 — Present", "Clearlake, CA"] */
  meta?: string[];
  /** Absolute filesystem path of a cover photo (optional). */
  coverPath?: string;
  /** Status accent: active → amber dot, otherwise green. */
  status?: 'active' | 'complete' | 'proposed';
  /** Site identity for the footer row. */
  siteName: string;
  siteUrl: string;
}

/* ------------------------------------------------------------------ fonts */
let fontsPromise: Promise<Font[]> | null = null;
function loadFonts(): Promise<Font[]> {
  if (fontsPromise) return fontsPromise;
  const root = join(process.cwd(), 'node_modules', '@fontsource');
  const read = (p: string) => readFile(join(root, p));
  fontsPromise = Promise.all([
    read('space-grotesk/files/space-grotesk-latin-700-normal.woff').then((data) => ({ name: 'Space Grotesk', data, weight: 700 as const, style: 'normal' as const })),
    read('space-grotesk/files/space-grotesk-latin-500-normal.woff').then((data) => ({ name: 'Space Grotesk', data, weight: 500 as const, style: 'normal' as const })),
    read('inter/files/inter-latin-400-normal.woff').then((data) => ({ name: 'Inter', data, weight: 400 as const, style: 'normal' as const })),
    read('inter/files/inter-latin-500-normal.woff').then((data) => ({ name: 'Inter', data, weight: 500 as const, style: 'normal' as const })),
    read('jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff').then((data) => ({ name: 'JetBrains Mono', data, weight: 500 as const, style: 'normal' as const })),
  ]);
  return fontsPromise;
}

/* ------------------------------------------------------------ helpers */
// satori requires an explicit display:flex on any element with several
// children — the helper adds it when missing so a template tweak can't fail
// the whole build over a layout technicality.
const h = (type: string, props: Record<string, unknown>, ...children: unknown[]) => {
  const kids = children.filter((c) => c !== null && c !== undefined && c !== false);
  // satori chokes on `undefined` style values and treats an empty children
  // array as "many children", so normalise both.
  const style = Object.fromEntries(Object.entries((props.style as Record<string, unknown>) ?? {}).filter(([, v]) => v !== undefined));
  if (kids.length > 1 && !style.display) style.display = 'flex';
  const out: Record<string, unknown> = { ...props, style };
  if (kids.length === 1) out.children = kids[0];
  else if (kids.length > 1) out.children = kids;
  else delete out.children;
  return { type, props: out };
};

/** Photo → small JPEG data URI so satori can embed it. Returns undefined when
 * the file can't be read (the card simply renders without a photo). */
async function coverDataUri(path: string, w: number, hgt: number): Promise<string | undefined> {
  try {
    const buf = await sharp(path).rotate().resize(w, hgt, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Fit a headline into the card: shorter titles get bigger type. */
function titleSize(title: string, hasCover: boolean): number {
  const len = title.length;
  const base = hasCover ? 60 : 72;
  if (len <= 22) return base;
  if (len <= 36) return base - 10;
  if (len <= 52) return base - 20;
  return base - 28;
}

const clamp = (s: string | undefined, max: number) =>
  !s ? '' : s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';

/* ------------------------------------------------------------- template */
export function cardTree(input: CardInput, cover?: string) {
  const hasCover = !!cover;
  const accent = input.status === 'active' ? HAZARD : FIELD;
  const textCol = hasCover ? 640 : 900;

  // registration-mark corner (figure motif)
  const corner = (pos: Record<string, number>, borders: Record<string, string>) =>
    h('div', { style: { position: 'absolute', width: 22, height: 22, ...pos, ...borders } });

  const photoPanel = hasCover
    ? h('div', {
        style: {
          position: 'absolute', right: 56, top: 56, width: 440, height: 518,
          display: 'flex', backgroundColor: INK_1, border: `1px solid ${LINE}`,
        },
      },
      h('img', { src: cover, width: 440, height: 518, style: { width: 440, height: 518, objectFit: 'cover', opacity: 0.94 } }),
      corner({ left: -1, top: -1 }, { borderLeft: `2px solid ${FIELD}`, borderTop: `2px solid ${FIELD}` }),
      corner({ right: -1, top: -1 }, { borderRight: `2px solid ${FIELD}`, borderTop: `2px solid ${FIELD}` }),
      corner({ left: -1, bottom: -1 }, { borderLeft: `2px solid ${FIELD}`, borderBottom: `2px solid ${FIELD}` }),
      corner({ right: -1, bottom: -1 }, { borderRight: `2px solid ${FIELD}`, borderBottom: `2px solid ${FIELD}` }),
      // caption strip
      h('div', {
        style: {
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 14px', display: 'flex',
          fontFamily: 'JetBrains Mono', fontSize: 15, letterSpacing: 1, color: PAPER_SOFT,
          backgroundColor: 'rgba(11,13,12,0.72)',
        },
      }, `FIG. 01 — ${clamp(input.title, 40).toUpperCase()}`),
    )
    : // no photo: a quiet contour field on the right
      h('div', {
        style: {
          position: 'absolute', right: -80, top: 40, width: 520, height: 520, display: 'flex',
          borderRadius: 9999, border: `1px solid ${LINE}`, opacity: 0.9,
        },
      },
      h('div', { style: { position: 'absolute', left: 70, top: 70, width: 380, height: 380, borderRadius: 9999, border: `1px solid ${LINE}` } }),
      h('div', { style: { position: 'absolute', left: 140, top: 140, width: 240, height: 240, borderRadius: 9999, border: `1px solid ${FIELD_DIM}` } }),
      h('div', { style: { position: 'absolute', left: 200, top: 200, width: 120, height: 120, borderRadius: 9999, backgroundColor: FIELD_DIM, opacity: 0.6 } }),
      );

  const metaChips = (input.meta ?? []).filter(Boolean).slice(0, 3).map((m) =>
    h('div', {
      style: {
        display: 'flex', padding: '7px 12px', border: `1px solid ${LINE}`, borderRadius: 6,
        fontFamily: 'JetBrains Mono', fontSize: 17, color: PAPER_SOFT, letterSpacing: 0.5, backgroundColor: 'rgba(18,22,19,0.8)',
      },
    }, m),
  );

  return h('div', {
    style: {
      width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', flexDirection: 'column', position: 'relative',
      backgroundColor: INK, color: PAPER, fontFamily: 'Inter',
      // faint survey grid + a field-green wash in the corner
      backgroundImage: `linear-gradient(${LINE}55 1px, transparent 1px), linear-gradient(90deg, ${LINE}55 1px, transparent 1px), radial-gradient(circle at 0% 100%, ${FIELD_DIM} 0%, ${INK} 55%)`,
      backgroundSize: '60px 60px, 60px 60px, 100% 100%',
    },
  },
    photoPanel,
    // left accent rule
    h('div', { style: { position: 'absolute', left: 56, top: 56, width: 4, height: 64, backgroundColor: accent, display: 'flex' } }),
    // eyebrow
    h('div', {
      style: {
        position: 'absolute', left: 76, top: 60, display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: 'JetBrains Mono', fontSize: 20, letterSpacing: 4, color: FIELD, textTransform: 'uppercase',
      },
    },
      h('div', { style: { width: 10, height: 10, borderRadius: 9999, backgroundColor: accent, display: 'flex' } }),
      input.eyebrow.toUpperCase(),
    ),
    // title + summary block, bottom-anchored
    h('div', {
      style: {
        position: 'absolute', left: 56, bottom: 130, width: textCol, display: 'flex', flexDirection: 'column', gap: 18,
      },
    },
      h('div', {
        style: {
          fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: titleSize(input.title, hasCover), lineHeight: 1.02,
          letterSpacing: -1.5, color: PAPER, display: 'flex',
        },
      }, clamp(input.title, 80)),
      input.summary
        ? h('div', { style: { fontFamily: 'Inter', fontSize: hasCover ? 22 : 26, lineHeight: 1.4, color: PAPER_SOFT, display: 'flex' } }, clamp(input.summary, hasCover ? 140 : 190))
        : null,
    ),
    // meta chips
    metaChips.length
      ? h('div', { style: { position: 'absolute', left: 56, bottom: 62, display: 'flex', gap: 10 } }, ...metaChips)
      : null,
    // footer identity
    h('div', {
      style: {
        position: 'absolute', right: hasCover ? 56 : 64, bottom: 24, display: 'flex', alignItems: 'center', gap: 14,
        fontFamily: 'JetBrains Mono', fontSize: 16, color: MUTED, letterSpacing: 1,
      },
    }, `${input.siteName.toUpperCase()}  ·  ${input.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`),
  );
}

/* --------------------------------------------------------------- render */
export async function renderCard(input: CardInput): Promise<Buffer> {
  const [fonts, cover] = await Promise.all([
    loadFonts(),
    input.coverPath ? coverDataUri(input.coverPath, 440, 518) : Promise.resolve(undefined),
  ]);
  const svg = await satori(cardTree(input, cover) as any, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toBuffer();
}
