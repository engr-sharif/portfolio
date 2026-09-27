/**
 * Atlas data — the public positions of project sites (and geotagged photos):
 *   • Project sites (published projects that carry approximate coordinates)
 *   • Field-photo points (gallery photos geotagged from their EXIF on upload)
 * Coordinates are snapped to ~1 km so public pins land in the right area, not
 * on an exact (potentially sensitive) client site.
 */
import { getProjects } from './projects';
import { dateRange } from './date-range';
import galleryData from '../content/settings/gallery.json';

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export interface ProjectPoint {
  title: string;
  slug: string;
  location: string;
  siteType: string;
  status: string;
  dates: string;
  lat: number;
  lng: number;
}
export interface PhotoPoint {
  caption: string;
  takenAt: string;
  lat: number;
  lng: number;
}

import { publicPosition, snap } from './privacy';
export { publicPosition };

export async function getAtlasPoints(): Promise<{ projects: ProjectPoint[]; photos: PhotoPoint[] }> {
  const projects = (await getProjects())
    .map((p) => ({ p, pos: publicPosition(p.data) }))
    .filter((x): x is { p: typeof x.p; pos: { lat: number; lng: number } } => x.pos != null)
    .map(({ p, pos: { lat, lng } }) => ({
      title: p.data.title,
      slug: p.id,
      location: p.data.location ?? '',
      siteType: p.data.siteType ?? '',
      status: p.data.status ?? '',
      dates: dateRange(p.data.startDate, p.data.endDate, p.data.status),
      lat,
      lng,
    }));

  const photos = ((galleryData as { photos?: Array<Record<string, unknown>> }).photos ?? [])
    .map((p) => ({ p, lat: num(p.lat), lng: num(p.lng) }))
    .filter((x): x is { p: Record<string, unknown>; lat: number; lng: number } => x.lat != null && x.lng != null)
    .map(({ p, lat, lng }) => ({
      caption: String(p.caption || p.alt || ''),
      takenAt: String(p.takenAt || ''),
      lat: snap(lat),
      lng: snap(lng),
    }));

  return { projects, photos };
}
