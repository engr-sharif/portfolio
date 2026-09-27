/**
 * The ground's world: plane coordinates, heightmap decoding and the point
 * clouds built from it. No WebGL here — just geometry, so it can be tested.
 *
 * Plane: x east, z south, 10 units from the north edge of the box to the
 * south edge; y up. Elevation is carried as a 0..1 fraction of 4,400 m and
 * lifted by the scene's current relief (vertical exaggeration).
 */
export interface BBox { west: number; east: number; south: number; north: number }
export interface Grid { w: number; h: number; elev: Float32Array; flags: Uint8Array }

export const METERS_MAX = 4400;
export const PLANE_H = 10;
export const FLAG = { sea: 1, lake: 2, state: 4, neighbour: 8 } as const;
/** Point kinds, as the shaders read them. */
export const KIND = { land: 0, neighbour: 1, lake: 2, sea: 3 } as const;

export function makeWorld(bbox: BBox) {
  const midLat = ((bbox.north + bbox.south) / 2) * (Math.PI / 180);
  const planeW = PLANE_H * ((bbox.east - bbox.west) * Math.cos(midLat)) / (bbox.north - bbox.south);
  const kmPerUnit = ((bbox.north - bbox.south) * 111.2) / PLANE_H;
  return {
    bbox, planeW, planeH: PLANE_H, kmPerUnit,
    toPlane(lat: number, lng: number) {
      return {
        x: ((lng - bbox.west) / (bbox.east - bbox.west) - 0.5) * planeW,
        z: ((bbox.north - lat) / (bbox.north - bbox.south) - 0.5) * PLANE_H,
      };
    },
    toLatLng(x: number, z: number) {
      return {
        lng: bbox.west + (x / planeW + 0.5) * (bbox.east - bbox.west),
        lat: bbox.north - (z / PLANE_H + 0.5) * (bbox.north - bbox.south),
      };
    },
    /** Vertical exaggeration for a relief (plane units per 4,400 m). */
    exaggeration(relief: number) { return (kmPerUnit * relief) / (METERS_MAX / 1000); },
  };
}
export type World = ReturnType<typeof makeWorld>;

/** Decode a heightmap image (R·256+G metres, B flags) without colour management. */
export async function loadGrid(url: string): Promise<Grid | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    if (bmp.width < 8) return null; // the build's placeholder: no data for this site
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    return decode(g.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
  } catch {
    return null;
  }
}

export function decode(px: Uint8ClampedArray | Uint8Array, w: number, h: number): Grid {
  const elev = new Float32Array(w * h), flags = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) {
    elev[k] = (px[k * 4] * 256 + px[k * 4 + 1]) / METERS_MAX;
    flags[k] = px[k * 4 + 2];
  }
  return { w, h, elev, flags };
}

/**
 * Hillshade, 0..1, lit from the north-west at 45° — the cartographer's
 * convention. `zScale` converts the 0..1 elevation to the cell's horizontal
 * units (so the same function serves the state and a 40 km patch).
 */
export function hillshade(g: Grid, zScale: number): Float32Array {
  const out = new Float32Array(g.w * g.h);
  const az = (315 * Math.PI) / 180, alt = Math.PI / 4;
  const lx = Math.sin(az) * Math.cos(alt), lz = -Math.cos(az) * Math.cos(alt), ly = Math.sin(alt);
  const e = (c: number, r: number) => g.elev[Math.min(g.h - 1, Math.max(0, r)) * g.w + Math.min(g.w - 1, Math.max(0, c))];
  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      const dx = (e(c + 1, r) - e(c - 1, r)) * zScale / 2;
      const dz = (e(c, r + 1) - e(c, r - 1)) * zScale / 2;
      // normal of y = f(x, z): (-dx, 1, -dz)
      const n = Math.hypot(dx, 1, dz);
      const lit = (-dx * lx + ly - dz * lz) / n;
      out[r * g.w + c] = Math.max(0, Math.min(1, lit)); // flat ground ≈ 0.71
    }
  }
  return out;
}

/**
 * Statewide cloud: [x, z, elev, kind, shade, delay] per point. The open sea is
 * thinned to a sparse grid (a sense of coast, not a wall of dots); `step`
 * thins everything on small screens.
 */
export function stateCloud(g: Grid, world: World, step: number, home: { x: number; z: number }) {
  const shade = hillshade(g, (METERS_MAX / 1000) * 3 / (world.kmPerUnit * (world.planeH / g.h)));
  const data: number[] = [];
  let maxD = 0;
  // a little deterministic jitter breaks the lattice when the camera is close
  let seed = 11;
  const jit = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.55;
  const cw = world.planeW / g.w, chh = world.planeH / g.h;
  for (let r = 0; r < g.h; r += step) {
    for (let c = 0; c < g.w; c += step) {
      const k = r * g.w + c, f = g.flags[k];
      const kind = f & FLAG.sea ? KIND.sea : f & FLAG.lake ? KIND.lake : f & FLAG.state ? KIND.land : KIND.neighbour;
      if (kind === KIND.sea && (r % (step * 3) !== 0 || c % (step * 3) !== 0)) continue;
      // the sea's sparse grid gets jitter too: a regular lattice of dashes
      // shimmers (moiré) on small screens as the camera moves
      const x = ((c + 0.5) / g.w - 0.5) * world.planeW + jit() * cw * step * (kind === KIND.sea ? 2 : 1);
      const z = ((r + 0.5) / g.h - 0.5) * world.planeH + jit() * chh * step * (kind === KIND.sea ? 2 : 1);
      const d = Math.hypot(x - home.x, z - home.z);
      maxD = Math.max(maxD, d);
      data.push(x, z, kind === KIND.sea ? 0 : g.elev[k], kind, shade[k], d);
    }
  }
  for (let i = 5; i < data.length; i += 6) data[i] /= maxD || 1;
  return new Float32Array(data);
}

export interface PatchSpec { lat: number; lng: number; north: number; south: number; west: number; east: number; n: number; radiusKm: number }

/** A site's close-up: [x, z, elev, kind, shade, km-from-site] per point. */
export function patchCloud(g: Grid, world: World, p: PatchSpec) {
  const nw = world.toPlane(p.north, p.west), se = world.toPlane(p.south, p.east);
  const cellUnits = (se.z - nw.z) / g.h;
  const shade = hillshade(g, (METERS_MAX / 1000) * 1.6 / (world.kmPerUnit * cellUnits));
  const site = world.toPlane(p.lat, p.lng);
  const data = new Float32Array(g.w * g.h * 6);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < g.w * g.h; k++) if (!(g.flags[k] & (FLAG.sea | FLAG.lake))) { lo = Math.min(lo, g.elev[k]); hi = Math.max(hi, g.elev[k]); }
  if (!Number.isFinite(lo)) { lo = 0; hi = 0.01; }
  let i = 0;
  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      const k = r * g.w + c, f = g.flags[k];
      const x = nw.x + ((c + 0.5) / g.w) * (se.x - nw.x);
      const z = nw.z + ((r + 0.5) / g.h) * (se.z - nw.z);
      const kind = f & FLAG.sea ? KIND.sea : f & FLAG.lake ? KIND.lake : KIND.land;
      data[i++] = x; data[i++] = z;
      data[i++] = kind === KIND.sea ? 0 : g.elev[k];
      data[i++] = kind;
      data[i++] = shade[k];
      data[i++] = Math.hypot(x - site.x, z - site.z) * world.kmPerUnit;
    }
  }
  return { data, rect: [nw.x, nw.z, se.x, se.z] as [number, number, number, number], range: [lo, hi] as [number, number] };
}

/** Elevation (0..1) under a plane point, from the statewide grid. */
export function sampleGrid(g: Grid, world: World, x: number, z: number) {
  const c = Math.round((x / world.planeW + 0.5) * g.w - 0.5);
  const r = Math.round((z / world.planeH + 0.5) * g.h - 0.5);
  const k = Math.min(g.h - 1, Math.max(0, r)) * g.w + Math.min(g.w - 1, Math.max(0, c));
  return g.flags[k] & FLAG.sea ? 0 : g.elev[k];
}

/* ----------------------------------------------------------------- section */

/** Layer ids the section shader styles (dot, line, ring, block, water, boring). */
export const LAYER = { sand: 0, clay: 1, gravel: 2, rock: 3, water: 4, boring: 5 } as const;

export interface Boring { slug: string; no: string; label: string; x: number; surf: number }

/**
 * A schematic geological section along a line of latitude, looking north:
 * valley fill thick where the ground is low and thin under the mountains,
 * a water table in the valleys, and a boring at each site near the line.
 * The strata are illustrative, and labelled as such on the page.
 *
 * Per point: [x, z, surf (0..1 elev), depth (units below surface), layer, reveal 0..1]
 */
export function sectionCloud(g: Grid, world: World, lat: number, borings: { slug: string; no: string; label: string; lat: number; lng: number }[]) {
  const z = world.toPlane(lat, world.bbox.west).z;
  const row = Math.min(g.h - 1, Math.max(0, Math.round((z / world.planeH + 0.5) * g.h - 0.5)));
  const BASE = -0.42;                 // flat bottom of the face (plane units)
  const DY = 0.011;
  const out: number[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const smooth = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  const cols: { x: number; surf: number }[] = [];
  for (let c = 0; c < g.w; c++) {
    const k = row * g.w + c;
    // California only: the face ends at the coast and at the Nevada line
    if (g.flags[k] & FLAG.sea || !(g.flags[k] & FLAG.state)) continue;
    cols.push({ x: ((c + 0.5) / g.w - 0.5) * world.planeW, surf: g.elev[k] });
  }
  const x0 = cols[0]?.x ?? 0, x1 = cols[cols.length - 1]?.x ?? 1;
  cols.forEach(({ x, surf }, i) => {
    const wob = Math.sin(x * 2.1) * 0.012 + Math.sin(x * 5.3 + 1) * 0.006;
    const low = 1 - smooth(0.0, 0.22, surf);          // 1 in the valley, 0 in the mountains
    const tSand = 0.025 + 0.19 * low + wob;
    const tClay = tSand + 0.02 + 0.1 * (1 - smooth(0.04, 0.35, surf)) + wob * 0.6;
    const tGravel = tClay + 0.05 + 0.03 * low;
    const top = surf * 1.05;                           // at base relief; the shader rescales
    const depthMax = top - BASE;
    const across = (x - x0) / Math.max(1e-6, x1 - x0);
    for (let d = 0.004; d < depthMax; d += DY) {
      const layer = d < tSand ? LAYER.sand : d < tClay ? LAYER.clay : d < tGravel ? LAYER.gravel : LAYER.rock;
      const rowN = Math.round(d / DY);
      // each layer draws its own pattern, like the lithology symbols on a log
      if (layer === LAYER.sand && (rowN + i) % 2) continue;
      if (layer === LAYER.clay && rowN % 2) continue;
      if (layer === LAYER.gravel && (i % 3 !== rowN % 3)) continue;
      if (layer === LAYER.rock && (rowN % 3 === 1 || (i + (rowN % 6 < 3 ? 0 : 1)) % 2)) continue;
      const jx = layer === LAYER.sand ? (rnd() - 0.5) * 0.012 : 0;
      out.push(x + jx, z, surf, d, layer, Math.min(1, (d / 1.1) * 0.75 + across * 0.25));
    }
    // water table: a line a little below the valley floor
    if (low > 0.35) out.push(x, z, surf, 0.018 + 0.03 * (1 - low), LAYER.water, 0.2 + across * 0.2);
  });
  const placed: Boring[] = [];
  for (const b of borings) {
    if (Math.abs(b.lat - lat) > 0.6) continue;
    const bx = world.toPlane(b.lat, b.lng).x;
    const col = cols.reduce((best, c) => (Math.abs(c.x - bx) < Math.abs(best.x - bx) ? c : best), cols[0]);
    if (!col) continue;
    for (let d = 0; d < 0.3; d += 0.006) out.push(bx, z, col.surf, d, LAYER.boring, 0.35 + d);
    placed.push({ slug: b.slug, no: b.no, label: b.label, x: bx, surf: col.surf });
  }
  return { data: new Float32Array(out), z, borings: placed, west: x0, east: x1, base: BASE };
}
