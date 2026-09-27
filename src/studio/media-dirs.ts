/** The folders the Studio manages media in — one tab each in the library. */
export interface MediaDir { id: string; dir: string; label: string; hint: string; kind: 'image' | 'file' | 'video' | 'audio' }
export const MEDIA_DIRS: MediaDir[] = [
  { id: 'covers', dir: 'src/assets/covers', label: 'Project covers', hint: 'Cover + gallery images for projects (optimised at build).', kind: 'image' },
  { id: 'blog', dir: 'src/assets/blog', label: 'Blog images', hint: 'Images used inside posts and as post covers.', kind: 'image' },
  { id: 'tools', dir: 'src/assets/tools', label: 'Tool screenshots', hint: 'Screenshots shown on tool pages.', kind: 'image' },
  { id: 'gallery', dir: 'src/assets/gallery', label: 'Field gallery', hint: 'Geotagged field photos for the map and gallery.', kind: 'image' },
  { id: 'avatars', dir: 'src/assets/avatars', label: 'Headshots', hint: 'The About-page portrait.', kind: 'image' },
  { id: 'og', dir: 'public/og', label: 'Share images', hint: 'Social preview images (1200×630). Served as-is.', kind: 'image' },
  { id: 'resume', dir: 'public/resume', label: 'Résumé', hint: 'The PDF behind “Download PDF”.', kind: 'file' },
  { id: 'loops', dir: 'public/media/loops', label: 'Loops', hint: 'Short silent clips (under 8 MB, 20 s) and their poster frames. Real videos go on YouTube.', kind: 'video' },
  { id: 'audio', dir: 'public/media/audio', label: 'Audio', hint: 'Voice notes and recordings (under 15 MB).', kind: 'audio' },
  { id: 'docs', dir: 'public/media/docs', label: 'Documents', hint: 'Public PDFs only (under 10 MB): fact sheets, posters. Never client deliverables.', kind: 'file' },
  { id: 'videos', dir: 'public/videos', label: 'Old videos', hint: 'Clips from before loops existed. New clips go under Loops.', kind: 'video' },
];
export const mediaDirById = (id: string) => MEDIA_DIRS.find((d) => d.id === id);
