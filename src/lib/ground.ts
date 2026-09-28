/**
 * Where each field photo stands on the home page's ground: its own GPS
 * (rounded to ~10 km) or, failing that, the project whose gallery or cover it
 * belongs to. That is the project's public position, unless the Studio
 * recorded the photo at another site (a multi-site project): then the photo's
 * own place, rounded to the project's privacy setting, still linked to it.
 * Photos with none of these aren't placed.
 * `stack` is the photo's index among the placed ones (the map's hand of
 * cards), null when it isn't on the map.
 */
import { getProjects } from './projects';
import { publicPosition } from './atlas';
import { photoPosition } from './privacy';
import { getImage } from './images';
import galleryData from '../content/settings/gallery.json';

type G = { image: string; caption?: string; alt?: string; lat?: number | string; lng?: number | string };
export interface GroundPhoto { image: string; caption?: string; alt?: string; place: { lat: number; lng: number; slug?: string } | null; stack: number | null }

const base = (s: string) => (s.split('/').pop() ?? s).toLowerCase();

export async function groundPhotos(): Promise<GroundPhoto[]> {
  const owner = new Map<string, { slug: string; lat: number; lng: number }>();
  for (const p of await getProjects()) {
    if (!publicPosition(p.data)) continue;
    for (const img of [p.data.coverImage, ...(p.data.gallery ?? [])]) {
      if (!img || owner.has(base(img))) continue;
      owner.set(base(img), { slug: p.id, ...photoPosition(p.data, p.data.photoPlaces?.[base(img)])! });
    }
  }
  let n = 0;
  return ((galleryData as { photos?: G[] }).photos ?? [])
    .filter((g) => getImage(g.image))
    .map((g) => {
      const lat = Number(g.lat), lng = Number(g.lng);
      const place = Number.isFinite(lat) && Number.isFinite(lng) && lat && lng
        ? { lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 }
        : owner.get(base(g.image)) ?? null;
      return { image: g.image, caption: g.caption, alt: g.alt, place, stack: place ? n++ : null };
    });
}
