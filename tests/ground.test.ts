import { describe, it, expect } from 'vitest';
import { makeWorld, decode, hillshade, stateCloud, patchCloud, sectionCloud, KIND, LAYER, METERS_MAX, type Grid } from '../src/scripts/ground/world';
import { patchFor, PRECISION_KM } from '../src/lib/sites';
import { publicPosition } from '../src/lib/privacy';

const bbox = { west: -124.6, east: -113.9, south: 32.3, north: 42.15 };
const world = makeWorld(bbox);

/** A synthetic grid: sea on the west, a valley, a range on the east; all "California". */
function grid(w = 48, h = 40): Grid {
  const px = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = (r * w + c) * 4;
    const sea = c < 6;
    const m = sea ? 0 : c < 24 ? 20 : Math.round(((c - 24) / (w - 24)) * 3000);
    px[i] = m >> 8; px[i + 1] = m & 255;
    px[i + 2] = sea ? 1 : 4;
    px[i + 3] = 255;
  }
  return decode(px, w, h);
}

describe('ground world', () => {
  it('round-trips plane coordinates', () => {
    for (const [lat, lng] of [[38.58, -121.49], [35.37, -119.02], [41.9, -124.1]]) {
      const p = world.toPlane(lat, lng);
      const back = world.toLatLng(p.x, p.z);
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lng).toBeCloseTo(lng, 6);
    }
  });

  it('decodes elevation in whole metres and the flags', () => {
    const g = grid();
    expect(g.elev[0]).toBe(0);
    expect(g.flags[0]).toBe(1);
    expect(g.elev[g.w - 1] * METERS_MAX).toBeGreaterThan(2800);
  });

  it('shades flat ground evenly and lights north-west slopes', () => {
    const g = grid();
    const s = hillshade(g, 10);
    expect(s[10 * g.w + 12]).toBeCloseTo(Math.SQRT1_2, 2);           // the flat valley
    const flat = s[10 * g.w + 12], slope = s[10 * g.w + 36];
    expect(slope).toBeGreaterThan(flat);                             // the range rises to the east, so its face looks west, toward a NW light
  });

  it('thins the open sea and keeps every land point', () => {
    const g = grid();
    const d = stateCloud(g, world, 1, world.toPlane(38.58, -121.49));
    let sea = 0, land = 0;
    for (let i = 3; i < d.length; i += 6) (d[i] === KIND.sea ? sea++ : land++);
    expect(land).toBe(g.w * g.h - 6 * g.h);
    expect(sea).toBeLessThan(6 * g.h / 4);
  });

  it('builds a section below the surface, California only, with borings near the line', () => {
    const g = grid();
    const s = sectionCloud(g, world, 38.6, [
      { slug: 'near', no: '01', label: 'Near', lat: 38.75, lng: -118.5 },
      { slug: 'far', no: '02', label: 'Far', lat: 35.4, lng: -119 },
    ]);
    expect(s.borings.map((b) => b.slug)).toEqual(['near']);
    for (let i = 0; i < s.data.length; i += 6) expect(s.data[i + 3]).toBeGreaterThanOrEqual(0); // depth below surface
    const layers = new Set<number>();
    for (let i = 4; i < s.data.length; i += 6) layers.add(s.data[i]);
    expect(layers.has(LAYER.rock)).toBe(true);
    expect(layers.has(LAYER.boring)).toBe(true);
    // the face starts where the sea ends
    expect(s.west).toBeGreaterThan(world.toPlane(38.6, bbox.west + (6 / g.w) * (bbox.east - bbox.west)).x - 0.01);
  });
});

describe('close-ups respect the privacy rounding', () => {
  it('centres on the public position, never the stored one', () => {
    const d = { lat: 38.7549, lng: -121.2873, privacy: 'site' as const };
    const p = patchFor(d)!;
    expect({ lat: p.lat, lng: p.lng }).toEqual(publicPosition(d));
  });

  it('is at least four times wider than the uncertainty it stands for', () => {
    for (const privacy of ['site', 'town', 'region'] as const) {
      const p = patchFor({ lat: 38.7, lng: -121.3, privacy })!;
      const spanKm = (p.north - p.south) * 111.32;
      expect(spanKm).toBeGreaterThanOrEqual(PRECISION_KM[privacy] * 4 - 0.01);
      expect(p.radiusKm).toBe(PRECISION_KM[privacy]);
    }
  });

  it('measures distance from the site for the precision ring', () => {
    const p = patchFor({ lat: 38.7, lng: -121.3 })!;
    const g = grid(48, 48);
    const { data, range } = patchCloud(g, world, p);
    let min = Infinity;
    for (let i = 5; i < data.length; i += 6) min = Math.min(min, data[i]);
    expect(min).toBeLessThan(2);                 // the centre cells are within ~a cell of the site
    expect(range[1]).toBeGreaterThan(range[0]);  // contrast from the patch's own relief
  });
});
