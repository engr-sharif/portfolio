import type { ImageMetadata } from 'astro';

/**
 * Image resolution for CMS-managed content.
 *
 * The CMS stores an image as a path string (e.g. "sbmm.jpg",
 * "/src/assets/covers/IMG_0030.JPG"). To make ANY such reference resolve
 * through Astro's <Image> optimizer regardless of which folder the editor
 * picked it from or how the file was named, we build ONE master map of every
 * image under src/assets, keyed by a case-insensitive basename. Uppercase
 * extensions (.JPG from phones) and cross-folder picks both resolve.
 */
const allModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/**/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF,Jpg,Jpeg,Png}',
  { eager: true },
);
// Auto-gallery fallback ("drop a file in src/assets/gallery") — gallery folder only.
const galleryModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/gallery/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF,Jpg,Jpeg,Png}',
  { eager: true },
);

// Normalize a stored value to a bare, lowercased filename so we match no matter
// how the CMS wrote it ("x.jpg", "/src/assets/covers/x.JPG", etc.).
const key = (s: string) => (s.split(/[\\/]/).pop() ?? s).toLowerCase();

function toMap(modules: Record<string, { default: ImageMetadata }>) {
  const map = new Map<string, ImageMetadata>();
  for (const [path, mod] of Object.entries(modules)) {
    map.set(key(path), mod.default);
  }
  return map;
}

const master = toMap(allModules);
const galleryMap = toMap(galleryModules);

/** Resolve any stored image reference to optimizable metadata. */
export const getImage = (name?: string) => (name ? master.get(key(name)) : undefined);

// Back-compat aliases — all resolve from the unified master map now.
export const getCover = getImage;
export const getGalleryImage = (name: string) => getImage(name);
export const getBlogImage = getImage;

/** Gallery-folder images sorted by filename — used by the auto-gallery fallback. */
export const allGalleryImages = [...galleryMap.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, img]) => ({ name, img }));
