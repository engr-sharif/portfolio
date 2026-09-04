/**
 * Field Atlas data — the two map layers, prepared once for both the homepage
 * Atlas and the About-page map:
 *   • Project sites (published projects that carry approximate coordinates)
 *   • Field-photo points (gallery photos geotagged from their EXIF on upload)
 * Coordinates are snapped to ~1 km so public pins land in the right area, not
 * on an exact (potentially sensitive) client site.
 */
import { getProjects } from './projects';
import { dateRange } from './date-range';
import galleryData from '../content/settings/gallery.json';

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

const snap = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export async function getAtlasPoints(): Promise<{ projects: ProjectPoint[]; photos: PhotoPoint[] }> {
  const projects = (await getProjects())
    .map((p) => ({ p, lat: num(p.data.lat), lng: num(p.data.lng) }))
    .filter((x): x is { p: typeof x.p; lat: number; lng: number } => x.lat != null && x.lng != null)
    .map(({ p, lat, lng }) => ({
      title: p.data.title,
      slug: p.id,
      location: p.data.location ?? '',
      siteType: p.data.siteType ?? '',
      status: p.data.status ?? '',
      dates: dateRange(p.data.startDate, p.data.endDate, p.data.status),
      lat: snap(lat),
      lng: snap(lng),
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
