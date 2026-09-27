import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import { getProjects } from '../../../lib/projects';
import { patchFor, type Patch } from '../../../lib/sites';
import lakes from '../../../data/ca-lakes.json';

/**
 * /data/site/<slug>.webp — the close-up terrain the home page flies into and
 * each report's key map stands on. Built from the same public elevation tiles
 * as the statewide ground, at ~120 m source resolution:
 *   R,G  elevation in whole metres (R·256 + G)
 *   B    1 sea, 2 lake
 *   A    255
 * If the tiles can't be fetched at build time the file is a 1×1 placeholder
 * and the page simply stays on the statewide ground for that site.
 */
export const getStaticPaths = (async () => {
  const projects = await getProjects();
  return projects
    .map((p) => ({ p, patch: patchFor(p.data) }))
    .filter((x): x is { p: typeof x.p; patch: Patch } => !!x.patch)
    .map(({ p, patch }) => ({ params: { slug: p.id }, props: { patch } }));
}) satisfies GetStaticPaths;

const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const Z = 10;
const lon2x = (lon: number) => ((lon + 180) / 360) * 2 ** Z;
const lat2y = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z; };

type Ring = number[][];
const inRing = (ring: Ring, lon: number, lat: number) => {
  let ok = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
};

async function tile(x: number, y: number) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${TILE}/${Z}/${x}/${y}.png`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
      return { data, ch: info.channels, size: info.width };
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((res) => setTimeout(res, 400 * 2 ** i));
    }
  }
  throw new Error('unreachable');
}

async function bake(p: Patch): Promise<Buffer> {
  const tiles = new Map<string, Awaited<ReturnType<typeof tile>>>();
  const jobs: Promise<void>[] = [];
  for (let x = Math.floor(lon2x(p.west)); x <= Math.floor(lon2x(p.east)); x++) {
    for (let y = Math.floor(lat2y(p.north)); y <= Math.floor(lat2y(p.south)); y++) {
      jobs.push(tile(x, y).then((t) => { tiles.set(`${x},${y}`, t); }));
    }
  }
  await Promise.all(jobs);
  const elevation = (lon: number, lat: number) => {
    const fx = lon2x(lon), fy = lat2y(lat);
    const t = tiles.get(`${Math.floor(fx)},${Math.floor(fy)}`);
    if (!t) return 0;
    const px = Math.min(t.size - 1, Math.floor((fx - Math.floor(fx)) * t.size));
    const py = Math.min(t.size - 1, Math.floor((fy - Math.floor(fy)) * t.size));
    const i = (py * t.size + px) * t.ch;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  const near = (lakes as { bbox: number[]; rings: Ring[] }[]).filter((l) => l.bbox[2] > p.west && l.bbox[0] < p.east && l.bbox[3] > p.south && l.bbox[1] < p.north);
  const n = p.n, dx = (p.east - p.west) / n, dy = (p.north - p.south) / n;
  const out = Buffer.alloc(n * n * 4);
  for (let r = 0; r < n; r++) {
    const lat = p.north - (r + 0.5) * dy;
    for (let c = 0; c < n; c++) {
      const lon = p.west + (c + 0.5) * dx;
      let e = 0;
      for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) e += elevation(lon + sx * 0.3 * dx, lat + sy * 0.3 * dy);
      e /= 9;
      const lake = near.some((l) => lon >= l.bbox[0] && lon <= l.bbox[2] && lat >= l.bbox[1] && lat <= l.bbox[3] && l.rings.some((ring) => inRing(ring, lon, lat)));
      const m = Math.max(0, Math.min(4400, Math.round(e)));
      const i = (r * n + c) * 4;
      out[i] = m >> 8; out[i + 1] = m & 255;
      out[i + 2] = (e <= 0.5 ? 1 : 0) | (lake ? 2 : 0);
      out[i + 3] = 255;
    }
  }
  return sharp(out, { raw: { width: n, height: n, channels: 4 } }).webp({ lossless: true, effort: 5 }).toBuffer();
}

export const GET: APIRoute = async ({ props, params }) => {
  let body: Buffer;
  try {
    body = await bake(props.patch as Patch);
  } catch (e) {
    console.warn(`[site terrain] ${params.slug}: ${(e as Error).message}; the close-up falls back to the statewide ground`);
    body = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).webp({ lossless: true }).toBuffer();
  }
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'image/webp' } });
};
