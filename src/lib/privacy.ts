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
const PRIVACY_STEP = { site: 0.01, town: 0.1, region: 0.5 } as const;

/**
 * The public position of a project: its stored coordinates rounded to its
 * privacy setting ('site' ≈ 1 km, 'town' ≈ 10 km, 'region' ≈ 50 km). Every
 * map and figure on the site goes through this; null = not shown.
 */
export function publicPosition(d: { lat?: number; lng?: number; privacy?: keyof typeof PRIVACY_STEP }): { lat: number; lng: number } | null {
  const lat = num(d.lat), lng = num(d.lng);
  if (lat == null || lng == null) return null;
  const step = PRIVACY_STEP[d.privacy ?? 'site'] ?? 0.01;
  return { lat: +snap(lat, step).toFixed(2), lng: +snap(lng, step).toFixed(2) };
}


