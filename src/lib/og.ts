/**
 * Social share cards — rendered at build time with satori (HTML/CSS → SVG)
 * and rasterised by sharp. The card is a drawing sheet: a title block along
 * the top, the title and summary, mono meta, and on the right either the
 * page's photo (with registration marks) or the California dot-relief with
 * the site pinned in cinnabar.
 *
 * Server-only (node:fs, sharp). Consumed by src/pages/og/[...slug].png.ts.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import satori, { type Font } from 'satori';
import sharp from 'sharp';
import { reliefSvg, VIEW_W, VIEW_H } from './terrain';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const GROUND = '#edede7';
const GROUND_2 = '#f6f6f1';
const INK = '#1a1c19';
const INK_2 = '#474a43';
const INK_3 = '#62655d';
const RULE = '#d2d3ca';
const RULE_2 = '#a7aa9f';
const RELIEF = '#8d9086';
const CINNABAR = '#d8431f';

export interface CardInput {
  /** Kind of page, e.g. "Project · Superfund site characterization". */
  eyebrow: string;
  title: string;
  summary?: string;
  meta?: string[];
  /** Absolute filesystem path of a photo (optional). */
  coverPath?: string;
  /** Pins on the relief panel (0..1 across the bbox, v from the north). */
  pins?: { u: number; v: number }[];
  siteName: string;
  siteUrl: string;
}

/* ------------------------------------------------------------------ fonts */
let fontsPromise: Promise<Font[]> | null = null;
function loadFonts(): Promise<Font[]> {
  if (fontsPromise) return fontsPromise;
  const nm = join(process.cwd(), 'node_modules', '@fontsource');
  const read = (p: string) => readFile(join(nm, p));
  fontsPromise = Promise.all([
    read('archivo/files/archivo-latin-500-normal.woff').then((data) => ({ name: 'Archivo', data, weight: 500 as const, style: 'normal' as const })),
    read('archivo/files/archivo-latin-600-normal.woff').then((data) => ({ name: 'Archivo', data, weight: 600 as const, style: 'normal' as const })),
    read('newsreader/files/newsreader-latin-400-normal.woff').then((data) => ({ name: 'Newsreader', data, weight: 400 as const, style: 'normal' as const })),
    read('ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff').then((data) => ({ name: 'Plex Mono', data, weight: 400 as const, style: 'normal' as const })),
  ]);
  return fontsPromise;
}

/* ------------------------------------------------------------ helpers */
// satori requires display:flex on any element with several children.
const h = (type: string, props: Record<string, unknown>, ...children: unknown[]) => {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  const style = Object.fromEntries(Object.entries((props.style as Record<string, unknown>) ?? {}).filter(([, v]) => v !== undefined));
  if (kids.length > 1 && !style.display) style.display = 'flex';
  const out: Record<string, unknown> = { ...props, style };
  if (kids.length === 1) out.children = kids[0];
  else if (kids.length > 1) out.children = kids;
  else delete out.children;
  return { type, props: out };
};

async function photoUri(path: string, w: number, hgt: number): Promise<string | undefined> {
  try {
    const buf = await sharp(path).rotate().resize(w, hgt, { fit: 'cover', position: 'attention' }).jpeg({ quality: 84 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

let reliefUri: Promise<string> | null = null;
function reliefPng(w: number, hgt: number): Promise<string> {
  reliefUri ??= reliefSvg().then(async (svg) => {
    const tinted = svg.replace('fill="#000"', `fill="${RELIEF}"`);
    const png = await sharp(Buffer.from(tinted)).resize(w, hgt).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  });
  return reliefUri;
}

function titleSize(title: string): number {
  const n = title.length;
  if (n <= 18) return 84;
  if (n <= 30) return 70;
  if (n <= 46) return 58;
  return 48;
}
const clamp = (s: string | undefined, max: number) =>
  !s ? '' : s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';

/* ------------------------------------------------------------- template */
const PANEL_W = 420;
const PANEL_H = 474;

function cardTree(input: CardInput, photo?: string, relief?: string) {
  const cell = (label: string, value: string, flex = 1) =>
    h('div', { style: { flex, display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 18px 14px', borderRight: `1px solid ${RULE_2}` } },
      h('div', { style: { fontFamily: 'Archivo', fontWeight: 600, fontSize: 13, letterSpacing: 2, color: INK_3 } }, label.toUpperCase()),
      h('div', { style: { fontFamily: 'Archivo', fontWeight: 500, fontSize: 19, color: INK } }, value),
    );

  const mark = (pos: Record<string, number>, b: Record<string, string>) => h('div', { style: { position: 'absolute', width: 20, height: 20, ...pos, ...b } });

  const panel = photo
    ? h('div', { style: { position: 'absolute', right: 48, top: 120, width: PANEL_W, height: PANEL_H, display: 'flex', border: `1px solid ${RULE}` } },
        h('img', { src: photo, width: PANEL_W, height: PANEL_H, style: { width: PANEL_W, height: PANEL_H, objectFit: 'cover' } }),
        mark({ left: 10, top: 10 }, { borderLeft: `2px solid ${CINNABAR}`, borderTop: `2px solid ${CINNABAR}` }),
        mark({ right: 10, bottom: 10 }, { borderRight: `2px solid ${CINNABAR}`, borderBottom: `2px solid ${CINNABAR}` }),
      )
    : h('div', { style: { position: 'absolute', right: 48, top: 120, width: PANEL_W, height: PANEL_H, display: 'flex', backgroundColor: GROUND_2, border: `1px solid ${RULE}` } },
        relief ? h('img', { src: relief, width: PANEL_W - 60, height: Math.round(((PANEL_W - 60) * VIEW_H) / VIEW_W), style: { position: 'absolute', left: 30, top: 16 } }) : null,
        ...(input.pins ?? []).map((p) => {
          const w = PANEL_W - 60, hh = Math.round((w * VIEW_H) / VIEW_W);
          const x = 30 + p.u * w, y = 16 + p.v * hh;
          return h('div', { style: { position: 'absolute', left: x - 9, top: y - 9, width: 18, height: 18, borderRadius: 9999, border: `2px solid ${CINNABAR}`, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            h('div', { style: { width: 6, height: 6, borderRadius: 9999, backgroundColor: CINNABAR } }));
        }),
      );

  return h('div', {
    style: { width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', flexDirection: 'column', position: 'relative', backgroundColor: GROUND, color: INK, fontFamily: 'Archivo' },
  },
    // title block
    h('div', { style: { position: 'absolute', left: 48, right: 48, top: 36, display: 'flex', borderTop: `1px solid ${RULE_2}`, borderLeft: `1px solid ${RULE_2}`, borderBottom: `1px solid ${RULE_2}`, backgroundColor: GROUND_2 } },
      cell('Name', input.siteName, 1.2),
      cell('Sheet', clamp(input.eyebrow, 46), 2),
      cell('Web', input.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''), 1.2),
    ),
    panel,
    // title + summary
    h('div', { style: { position: 'absolute', left: 48, top: 150, width: 640, display: 'flex', flexDirection: 'column', gap: 22 } },
      h('div', { style: { fontFamily: 'Archivo', fontWeight: 500, fontSize: titleSize(input.title), lineHeight: 1.0, letterSpacing: -2, color: INK } }, clamp(input.title, 72)),
      input.summary ? h('div', { style: { fontFamily: 'Newsreader', fontSize: 26, lineHeight: 1.4, color: INK_2 } }, clamp(input.summary, 150)) : null,
    ),
    // meta
    (input.meta ?? []).length
      ? h('div', { style: { position: 'absolute', left: 48, bottom: 44, width: 640, display: 'flex', gap: 22, fontFamily: 'Plex Mono', fontSize: 17, color: INK_3 } },
          ...(input.meta ?? []).filter(Boolean).slice(0, 3).map((m, i) => h('div', { style: { display: 'flex', gap: 22 } }, i ? h('div', { style: { color: CINNABAR } }, '·') : null, m)))
      : null,
  );
}

/* --------------------------------------------------------------- render */
export async function renderCard(input: CardInput): Promise<Buffer> {
  const [fonts, photo, relief] = await Promise.all([
    loadFonts(),
    input.coverPath ? photoUri(input.coverPath, PANEL_W, PANEL_H) : Promise.resolve(undefined),
    input.coverPath ? Promise.resolve(undefined) : reliefPng(PANEL_W - 60, Math.round(((PANEL_W - 60) * VIEW_H) / VIEW_W)),
  ]);
  const svg = await satori(cardTree(input, photo, relief) as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
