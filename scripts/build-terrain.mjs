#!/usr/bin/env node
/**
 * Bake California's real terrain into a small heightmap the WebGL scene can
 * sample on the GPU.
 *
 *   node scripts/build-terrain.mjs
 *
 * Sources (public, no keys):
 *   • Elevation — Mapzen/AWS "terrarium" tiles (SRTM-derived, ~1 km at z7)
 *   • Boundary  — Natural-Earth-derived US states GeoJSON
 *
 * Output:
 *   public/data/ca-terrain.png   192×216 RGBA — R: elevation (0..255 over
 *                                0..METERS_MAX m), G: sea flag, A: inside-CA
 *                                mask (255 in, 96 neighbouring land, 0 ocean)
 *   src/data/ca-terrain.json     bbox, grid size, scale, credits
 *
 * Re-run only when you want to change resolution; the outputs are committed.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const BBOX = { west: -124.6, east: -113.9, south: 32.3, north: 42.15 }; // California + margin
const W = 192, H = 216;                                                   // grid (≈ CA's projected aspect)
const Z = 7;                                                              // tile zoom (~1.2 km/px)
const METERS_MAX = 4400;                                                  // Mt Whitney is 4421 m

const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const STATES = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

// --- web-mercator helpers ---------------------------------------------------
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

// --- fetch the tiles that cover the bbox -------------------------------------
const x0 = Math.floor(lon2x(BBOX.west, Z)), x1 = Math.floor(lon2x(BBOX.east, Z));
const y0 = Math.floor(lat2y(BBOX.north, Z)), y1 = Math.floor(lat2y(BBOX.south, Z));
const tiles = new Map();
const jobs = [];
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
  jobs.push((async () => {
    const res = await fetch(`${TILE}/${Z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tile ${Z}/${x}/${y}: HTTP ${res.status}`);
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    tiles.set(`${x},${y}`, { data, ch: info.channels, size: info.width });
  })());
}
await Promise.all(jobs);
console.log(`fetched ${tiles.size} terrarium tiles at z${Z}`);

/** Elevation (m) at lon/lat via the terrarium encoding. */
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

// --- California polygon → point-in-polygon mask ------------------------------
const states = await (await fetch(STATES)).json();
const ca = states.features.find((f) => f.properties.name === 'California');
const rings = ca.geometry.type === 'Polygon' ? [ca.geometry.coordinates[0]] : ca.geometry.coordinates.map((p) => p[0]);
function inside(lon, lat) {
  let ok = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ok = !ok;
    }
  }
  return ok;
}

// --- sample the grid ---------------------------------------------------------
const rgba = Buffer.alloc(W * H * 4);
let maxSeen = 0, land = 0, inCA = 0;
for (let row = 0; row < H; row++) {
  const lat = BBOX.north - ((row + 0.5) / H) * (BBOX.north - BBOX.south);
  for (let col = 0; col < W; col++) {
    const lon = BBOX.west + ((col + 0.5) / W) * (BBOX.east - BBOX.west);
    // 3×3 supersample for a smoother field
    let e = 0;
    for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
      e += elevation(lon + (sx * 0.3 * (BBOX.east - BBOX.west)) / W, lat + (sy * 0.3 * (BBOX.north - BBOX.south)) / H);
    }
    e /= 9;
    const sea = e <= 1;
    const inState = inside(lon, lat);
    maxSeen = Math.max(maxSeen, e);
    if (!sea) land++;
    if (inState) inCA++;
    const i = (row * W + col) * 4;
    rgba[i] = Math.max(0, Math.min(255, Math.round((Math.max(0, e) / METERS_MAX) * 255)));
    rgba[i + 1] = sea ? 255 : 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = inState ? 255 : sea ? 0 : 96;
  }
}

await mkdir('public/data', { recursive: true });
await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile('public/data/ca-terrain.png');
await writeFile('src/data/ca-terrain.json', JSON.stringify({
  bbox: BBOX, width: W, height: H, metersMax: METERS_MAX, zoom: Z,
  credits: 'Elevation: Mapzen Terrarium (SRTM, NED, GMTED). Boundary: Natural Earth via PublicaMundi.',
  generated: new Date().toISOString().slice(0, 10),
}, null, 2) + '\n');
console.log(`wrote public/data/ca-terrain.png (${W}×${H}); max elevation seen ${Math.round(maxSeen)} m; land ${land}/${W * H}; in-CA ${inCA}`);
