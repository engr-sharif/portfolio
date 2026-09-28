/**
 * The one rule for showing a location: stored coordinates rounded to the
 * project's privacy setting ('site' ≈ 1 km, 'town' ≈ 10 km, 'region' ≈ 50 km).
 * Pure, so the build, the pages and the tests all share it.
 */
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export const snap = (n: number, step = 0.01) => Math.round(n / step) * step;

/** How coarsely each privacy setting shows a location (degrees). */
export const PRIVACY_STEP = { site: 0.01, town: 0.1, region: 0.5 } as const;
export type Privacy = keyof typeof PRIVACY_STEP;

/** How far a public position may sit from the real one, in km (rounded up). */
export const PRECISION_KM: Record<Privacy, number> = { site: 1, town: 10, region: 50 };

/**
 * The public position of a project: its stored coordinates rounded to its
 * privacy setting ('site' ≈ 1 km, 'town' ≈ 10 km, 'region' ≈ 50 km). Every
 * map and figure on the site goes through this; null = not shown.
 */
export function publicPosition(d: { lat?: number; lng?: number; privacy?: Privacy }): { lat: number; lng: number } | null {
  const lat = num(d.lat), lng = num(d.lng);
  if (lat == null || lng == null) return null;
  const step = PRIVACY_STEP[d.privacy ?? 'site'] ?? 0.01;
  return { lat: +snap(lat, step).toFixed(2), lng: +snap(lng, step).toFixed(2) };
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A photo's key in a project's `photoPlaces`: its lowercased file name. */
export const photoKey = (path: string) => (path.split(/[\\/]/).pop() ?? path).toLowerCase();

/**
 * Where a project's photo stands on a map: the project's public position,
 * unless the photo was recorded at another site (further than twice the
 * rounding away), then its own place rounded the same way. Photos at the
 * same site are never spread across it, which would map where the work was.
 */
export function photoPosition(project: { lat?: number; lng?: number; privacy?: Privacy }, own?: { lat: number; lng: number }): { lat: number; lng: number } | null {
  const pos = publicPosition(project);
  if (!pos || !own) return pos;
  const privacy = project.privacy ?? 'site';
  const at = publicPosition({ ...own, privacy });
  return at && distanceKm(at, pos) > 2 * PRECISION_KM[privacy] ? at : pos;
}
