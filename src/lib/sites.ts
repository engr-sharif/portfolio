/**
 * Close-up terrain for each mapped project: a square patch of real elevation
 * centred on the project's PUBLIC position (already rounded to its privacy
 * setting), so a close-up never shows more than the rounding allows. A patch
 * is always at least four times wider than the uncertainty it stands for.
 */
import { publicPosition, PRECISION_KM, type Privacy } from './privacy';

export { PRECISION_KM, type Privacy };

export const PATCH_N = 128;

export interface Patch {
  lat: number; lng: number;
  north: number; south: number; west: number; east: number;
  n: number;
  radiusKm: number;
}

export function patchFor(d: { lat?: number; lng?: number; privacy?: Privacy }): Patch | null {
  const pos = publicPosition(d);
  if (!pos) return null;
  const radiusKm = PRECISION_KM[d.privacy ?? 'site'] ?? 1;
  const spanKm = Math.max(40, radiusKm * 4);
  const halfLat = spanKm / 111.32 / 2;
  const halfLng = halfLat / Math.cos((pos.lat * Math.PI) / 180);
  return {
    lat: pos.lat, lng: pos.lng,
    north: +(pos.lat + halfLat).toFixed(5), south: +(pos.lat - halfLat).toFixed(5),
    west: +(pos.lng - halfLng).toFixed(5), east: +(pos.lng + halfLng).toFixed(5),
    n: PATCH_N,
    radiusKm,
  };
}
