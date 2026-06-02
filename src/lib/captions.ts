import captions from '../content/settings/captions.json';

/**
 * Per-photo captions, keyed by lowercased basename so any stored path resolves
 * (e.g. "/src/assets/covers/IMG_0030.JPG" → "img_0030.jpg"). Shown in the image
 * viewer when a photo is opened.
 */
const map = captions as Record<string, string>;
const key = (s: string) => (s.split(/[\\/]/).pop() ?? s).toLowerCase();

export const getCaption = (name?: string): string =>
  name ? map[key(name)] ?? '' : '';
