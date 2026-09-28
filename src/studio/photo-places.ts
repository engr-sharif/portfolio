/**
 * What a project photo's GPS is used for, read at upload before the file is
 * stripped (image-process.ts):
 *   - the project's location, when it has none yet (the phone knew);
 *   - a check that the photo belongs here: taken far from the project's
 *     location, it is flagged so a photo can't slip into the wrong project;
 *   - `photoPlaces`, where each photo was taken, rounded to the project's
 *     privacy setting before it is stored (the repository is public).
 * Changes to `photoPlaces` are updaters, applied to the entry's current value,
 * so a cover and a gallery uploading at once can't overwrite each other.
 * Pure, so it can be tested without a browser.
 */
import { PRIVACY_STEP, distanceKm, photoKey, snap, type Privacy } from '../lib/privacy';
import { roundCoord, type ImageMeta } from './image-process';

/** Further than this from the project's location reads as another site. */
export const FAR_KM = 25;

type LatLng = { lat: number; lng: number };
export type Places = Record<string, LatLng>;
export interface PhotoEntry { lat?: unknown; lng?: unknown; privacy?: unknown; coverImage?: unknown; gallery?: unknown }
export interface Placed {
  /** The photo's key and its place, rounded to the privacy setting (absent without GPS). */
  key?: string; at?: LatLng;
  /** A location for a project that has none yet. */
  fill?: LatLng;
  /** Distance in km from the project's location, when far enough to query. */
  farKm?: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null);
const privacyOf = (v: unknown): Privacy => (v === 'town' || v === 'region' ? v : 'site');

export function placePhoto(entry: PhotoEntry, path: string, meta: ImageMeta): Placed {
  if (meta.lat == null || meta.lng == null) return {};
  const step = PRIVACY_STEP[privacyOf(entry.privacy)];
  const placed: Placed = { key: photoKey(path), at: { lat: +snap(meta.lat, step).toFixed(2), lng: +snap(meta.lng, step).toFixed(2) } };
  const lat = num(entry.lat), lng = num(entry.lng);
  if (lat == null || lng == null) return { ...placed, fill: { lat: roundCoord(meta.lat), lng: roundCoord(meta.lng) } };
  const km = distanceKm({ lat, lng }, { lat: meta.lat, lng: meta.lng });
  return km > FAR_KM ? { ...placed, farKm: Math.round(km) } : placed;
}

/** An update recording a photo's place. */
export const addPlace = (key: string, at: LatLng) => (places?: Places): Places => ({ ...(places ?? {}), [key]: at });

/**
 * An update dropping the place of a photo that has left the entry, or null
 * when the entry still uses that photo elsewhere (the cover and the gallery).
 */
export function forgetPhoto(entry: PhotoEntry, path: string): ((places?: Places) => Places | undefined) | null {
  const key = photoKey(path);
  const uses = [entry.coverImage, ...(Array.isArray(entry.gallery) ? entry.gallery : [])]
    .filter((p) => typeof p === 'string' && photoKey(p) === key).length;
  if (uses > 1) return null;
  return (places) => {
    if (!places?.[key]) return places;
    const { [key]: _gone, ...rest } = places;
    return Object.keys(rest).length ? rest : undefined;
  };
}
