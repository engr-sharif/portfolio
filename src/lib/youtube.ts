/**
 * One definition of "a YouTube link", shared by the content schema, the site's
 * facade and the Studio field, so a link the Studio accepts always builds.
 */
export const YOUTUBE_RE = /^https?:\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})(?![\w-])/;

/** The 11-character video id, or null. */
export const youtubeId = (url: string): string | null => url.trim().match(YOUTUBE_RE)?.[1] ?? null;

/** The short canonical form the Studio stores. */
export const youtubeCanonical = (url: string): string | null => {
  const id = youtubeId(url);
  return id ? `https://youtu.be/${id}` : null;
};
