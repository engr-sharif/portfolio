/**
 * Terrain helpers — server-side (build time) only.
 *
 * The heightmap public/data/ca-terrain.png (see scripts/build-terrain.mjs) is
 * an equirectangular grid over California: row 0 is the north edge, R holds
 * elevation (0–255 over 0–4,400 m), G flags sea, A is 255 inside the state and
 * 96 on neighbouring land. From it we draw the dot-relief used by every
 * locator figure, and project lat/lng into the same space.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import meta from '../data/ca-terrain.json';

export const BBOX = meta.bbox;
const MID_LAT = ((BBOX.north + BBOX.south) / 2) * (Math.PI / 180);
/** Ground width ÷ height of the bbox (longitude degrees shrink with latitude). */
export const ASPECT = ((BBOX.east - BBOX.west) * Math.cos(MID_LAT)) / (BBOX.north - BBOX.south);
/** Relief SVG user space: 1000 units tall, ASPECT × 1000 wide. */
export const VIEW_H = 1000;
export const VIEW_W = Math.round(ASPECT * VIEW_H);
/** Kilometres per SVG unit, north–south (1° of latitude ≈ 111.2 km). */
export const KM_PER_UNIT = ((BBOX.north - BBOX.south) * 111.2) / VIEW_H;

/** lat/lng → 0..1 across the bbox, v measured from the north edge. */
export function toUV(lat: number, lng: number) {
  return {
    u: (lng - BBOX.west) / (BBOX.east - BBOX.west),
    v: (BBOX.north - lat) / (BBOX.north - BBOX.south),
  };
}

let reliefPromise: Promise<string> | null = null;

/**
 * The state as a dot-relief: one dot per 2×2 heightmap cells, sized and
 * weighted by elevation; neighbouring land is a faint context. Returned as an
 * SVG string (used as a CSS mask, so it takes the theme's colour).
 */
export function reliefSvg(): Promise<string> {
  if (reliefPromise) return reliefPromise;
  reliefPromise = (async () => {
    const png = readFileSync(join(process.cwd(), 'public/data/ca-terrain.png'));
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = info;
    const STEP = 2;
    const sx = VIEW_W / W;
    const sy = VIEW_H / H;
    const dots: string[] = [];
    for (let row = 0; row < H; row += STEP) {
      for (let col = 0; col < W; col += STEP) {
        // average the STEP×STEP block
        let e = 0, a = 0, sea = 0, n = 0;
        for (let dy = 0; dy < STEP && row + dy < H; dy++) {
          for (let dx = 0; dx < STEP && col + dx < W; dx++) {
            const i = ((row + dy) * W + (col + dx)) * 4;
            e += data[i]; sea += data[i + 1] > 127 ? 1 : 0; a += data[i + 3]; n++;
          }
        }
        e /= n * 255; a /= n; sea /= n;
        if (sea > 0.5 || a < 40) continue;
        const inState = a > 200;
        const cx = (col + STEP / 2) * sx;
        const cy = (row + STEP / 2) * sy;
        const cell = STEP * sy;
        const r = inState ? cell * (0.2 + 0.26 * Math.sqrt(e)) : cell * 0.16;
        const o = inState ? 0.5 + 0.5 * Math.min(1, e * 1.6) : 0.22;
        dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(2)}"${o < 0.995 ? ` fill-opacity="${o.toFixed(2)}"` : ''}/>`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}"><g fill="#000">${dots.join('')}</g></svg>`;
  })();
  return reliefPromise;
}
