#!/usr/bin/env node
/**
 * Bake the home page's ground: California at four times the density of the
 * relief figures, with 16-bit elevation and water.
 *
 *   node scripts/build-ground.mjs
 *
 * Sources (public, no keys):
 *   • Elevation — Mapzen/AWS "terrarium" tiles (SRTM, NED, GMTED), z8
 *   • Boundary  — Natural-Earth-derived US states GeoJSON
 *   • Lakes     — Natural Earth 10 m lakes, global and North American sets
 *                 (Tahoe, Clear Lake, Mono, Salton Sea, the reservoirs)
 *
 * The sea is flood-filled from the map's edge, so ground below sea level that
 * isn't open water (Death Valley, the Imperial Valley) stays land.
 *
 * Output:
 *   public/data/ca-ground.webp  384×432 lossless RGBA — R,G: elevation in
 *                               whole metres (R·256 + G); B: flags (1 sea,
 *                               2 lake, 4 California, 8 neighbouring land);
 *                               A: 255
 *   src/data/ca-ground.json     bbox, grid size, scale, credits
 *   src/data/ca-lakes.json      the lake outlines inside the box (build-time
 *                               input for the per-site close-ups)
 *
 * The 192×216 ca-terrain.png (build-terrain.mjs) still drives the dot-relief
 * figures; this file only feeds the WebGL ground. Re-run to change resolution.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const BBOX = { west: -124.6, east: -113.9, south: 32.3, north: 42.15 };
const W = 384, H = 432;
const Z = 8;
const METERS_MAX = 4400;

const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const STATES = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';
const LAKES = [
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes_north_america.geojson',
];

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

async function fetchRetry(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries - 1) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 500 * 2 ** i));
    }
  }
}

// --- tiles ------------------------------------------------------------------
const x0 = Math.floor(lon2x(BBOX.west, Z)), x1 = Math.floor(lon2x(BBOX.east, Z));
const y0 = Math.floor(lat2y(BBOX.north, Z)), y1 = Math.floor(lat2y(BBOX.south, Z));
const tiles = new Map();
const queue = [];
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) queue.push([x, y]);
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const [x, y] = queue.pop();
    const res = await fetchRetry(`${TILE}/${Z}/${x}/${y}.png`);
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    tiles.set(`${x},${y}`, { data, ch: info.channels, size: info.width });
  }
}));
console.log(`fetched ${tiles.size} terrarium tiles at z${Z}`);

function elevation(lon, lat) {
  const fx = lon2x(lon, Z), fy = lat2y(lat, Z);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const t = tiles.get(`${tx},${ty}`);
  if (!t) return 0;
  const px = Math.min(t.size - 1, Math.floor((fx - tx) * t.size));
  const py = Math.min(t.size - 1, Math.floor((fy - ty) * t.size));
  const i = (py * t.size + px) * t.ch;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}

// --- polygons ---------------------------------------------------------------
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => p[0]);
function inRings(rings, lon, lat) {
  let ok = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ok = !ok;
    }
  }
  return ok;
}
const states = await (await fetchRetry(STATES)).json();
const caRings = ringsOf(states.features.find((f) => f.properties.name === 'California').geometry);
const lakes = (await Promise.all(LAKES.map(async (u) => (await (await fetchRetry(u)).json()).features))).flat()
  .filter((f) => { const [a, b, c, d] = f.bbox; return c > BBOX.west && a < BBOX.east && d > BBOX.south && b < BBOX.north; })
  .map((f) => ({ name: f.properties.name, bbox: f.bbox, rings: ringsOf(f.geometry) }));
const inLake = (lon, lat) => lakes.some((l) => lon >= l.bbox[0] && lon <= l.bbox[2] && lat >= l.bbox[1] && lat <= l.bbox[3] && inRings(l.rings, lon, lat));

// --- sample -----------------------------------------------------------------
const dx = (BBOX.east - BBOX.west) / W, dy = (BBOX.north - BBOX.south) / H;
const elev = new Float32Array(W * H), spread = new Float32Array(W * H);
for (let row = 0; row < H; row++) {
  const lat = BBOX.north - (row + 0.5) * dy;
  for (let col = 0; col < W; col++) {
    const lon = BBOX.west + (col + 0.5) * dx;
    let sum = 0, lo = Infinity, hi = -Infinity;
    for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
      const e = elevation(lon + sx * 0.3 * dx, lat + sy * 0.3 * dy);
      sum += e; lo = Math.min(lo, e); hi = Math.max(hi, e);
    }
    elev[row * W + col] = sum / 9;
    spread[row * W + col] = hi - lo;
  }
}

// open sea: flood fill from every edge cell at or below sea level
const sea = new Uint8Array(W * H);
const stack = [];
for (let c = 0; c < W; c++) stack.push(c, (H - 1) * W + c);
for (let r = 0; r < H; r++) stack.push(r * W, r * W + W - 1);
while (stack.length) {
  const k = stack.pop();
  if (sea[k] || elev[k] > 1) continue;
  sea[k] = 1;
  const r = Math.floor(k / W), c = k % W;
  if (c > 0) stack.push(k - 1);
  if (c < W - 1) stack.push(k + 1);
  if (r > 0) stack.push(k - W);
  if (r < H - 1) stack.push(k + W);
}

const rgba = Buffer.alloc(W * H * 4);
let lakeCells = 0, maxSeen = 0;
const lakeHits = new Set();
for (let row = 0; row < H; row++) {
  const lat = BBOX.north - (row + 0.5) * dy;
  for (let col = 0; col < W; col++) {
    const lon = BBOX.west + (col + 0.5) * dx;
    const k = row * W + col, e = elev[k];
    const isSea = !!sea[k];
    const lake = !isSea && inLake(lon, lat);
    if (lake) { lakeCells++; lakes.forEach((l) => { if (!lakeHits.has(l.name) && inRings(l.rings, lon, lat)) lakeHits.add(l.name); }); }
    const inCA = inRings(caRings, lon, lat);
    maxSeen = Math.max(maxSeen, e);
    const m = Math.max(0, Math.min(METERS_MAX, Math.round(e)));
    const i = k * 4;
    rgba[i] = m >> 8;
    rgba[i + 1] = m & 255;
    rgba[i + 2] = (isSea ? 1 : 0) | (lake ? 2 : 0) | (inCA ? 4 : 0) | (!isSea && !inCA ? 8 : 0);
    rgba[i + 3] = 255;
  }
}

await mkdir('public/data', { recursive: true });
await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ lossless: true, effort: 6 }).toFile('public/data/ca-ground.webp');
await writeFile('src/data/ca-ground.json', JSON.stringify({
  bbox: BBOX, width: W, height: H, metersMax: METERS_MAX, zoom: Z,
  lakes: [...lakeHits].sort(),
  credits: 'Elevation: Mapzen Terrarium (SRTM, NED, GMTED). Boundary: Natural Earth via PublicaMundi. Lakes: Natural Earth.',
  generated: new Date().toISOString().slice(0, 10),
}, null, 2) + '\n');
// Lake outlines inside the box, for the per-site close-ups (src/pages/data/site).
await writeFile('src/data/ca-lakes.json', JSON.stringify(lakes
  .filter((l) => lakeHits.has(l.name))
  .map((l) => ({ name: l.name, bbox: l.bbox.map((v) => +v.toFixed(4)), rings: l.rings.map((r) => r.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])) }))) + '\n');
console.log(`wrote public/data/ca-ground.webp (${W}×${H}); max ${Math.round(maxSeen)} m; ${lakeCells} lake cells in ${lakeHits.size} lakes`);
