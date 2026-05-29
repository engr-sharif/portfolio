import type { ImageMetadata } from 'astro';

/**
 * Build-time maps from a filename to its optimizable ImageMetadata, so
 * CMS-managed string paths (e.g. "sbmm.jpg") can still flow through Astro's
 * <Image> optimizer. Drop a file in the folder, reference its name → done.
 */
const coverModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/covers/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);
const galleryModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/gallery/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);
const blogModules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/blog/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

function toMap(modules: Record<string, { default: ImageMetadata }>) {
  const map = new Map<string, ImageMetadata>();
  for (const [path, mod] of Object.entries(modules)) {
    const name = path.split('/').pop()!;
    map.set(name, mod.default);
  }
  return map;
}

export const covers = toMap(coverModules);
export const galleryImages = toMap(galleryModules);
export const blogImages = toMap(blogModules);

// Normalize to a bare filename so we match regardless of how the CMS stores the
// value (e.g. "sbmm.jpg", "/covers/sbmm.jpg", "src/assets/covers/sbmm.jpg").
const basename = (s: string) => s.split(/[\\/]/).pop() ?? s;

export const getCover = (name?: string) =>
  name ? covers.get(basename(name)) : undefined;

export const getGalleryImage = (name: string) =>
  galleryImages.get(basename(name));

export const getBlogImage = (name?: string) =>
  name ? blogImages.get(basename(name)) : undefined;

/** All gallery images sorted by filename — used by the auto gallery. */
export const allGalleryImages = [...galleryImages.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, img]) => ({ name, img }));
