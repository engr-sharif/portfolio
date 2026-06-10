/**
 * Studio helpers that compose the api + schema (kept out of api.ts so api stays
 * a thin transport layer).
 */
import { login as apiLogin, clearToken, isLoggedIn as apiIsLoggedIn, listDir, readFile, writeFile, rawImageUrl } from './api';
import { parse } from './frontmatter';
import { collections, type Collection } from './schema';

export const login = apiLogin;
export const isLoggedIn = apiIsLoggedIn;
export const logout = () => clearToken();

export interface CollStat { id: string; label: string; total: number; live: number; draft: number }

/** Per-collection counts for the dashboard (folder collections only). */
export async function getStats(): Promise<CollStat[]> {
  const folders = collections.filter((c) => c.kind === 'folder');
  return Promise.all(
    folders.map(async (c) => {
      try {
        const rows = await listEntries(c);
        const live = rows.filter((r) => r.status === 'live').length;
        const draft = rows.filter((r) => r.status === 'draft').length;
        return { id: c.id, label: c.label, total: rows.length, live, draft };
      } catch {
        return { id: c.id, label: c.label, total: 0, live: 0, draft: 0 };
      }
    }),
  );
}

export interface EntryRow { path: string; label: string; status?: string }

/** List entries of a folder collection with their label + status, newest first. */
export async function listEntries(collection: Collection): Promise<EntryRow[]> {
  const files = (await listDir(collection.dir!)).filter((f) => f.type === 'file' && /\.mdx?$/.test(f.name));
  const rows = await Promise.all(
    files.map(async (f) => {
      try {
        const { content } = await readFile(f.path);
        const { data } = parse(content || '');
        let status: string | undefined;
        if (collection.statusField === 'published') status = data.published ? 'live' : 'draft';
        else if (collection.statusField === 'draft') status = data.draft ? 'draft' : 'live';
        return { path: f.path, label: String(data[collection.labelField] || f.name), status, order: Number(data.order ?? 0), date: String(data.pubDate ?? '') };
      } catch {
        return { path: f.path, label: f.name, order: 0, date: '' };
      }
    }),
  );
  // Sort: projects/tools by order; blog by date desc.
  if (collection.id === 'blog') rows.sort((a, b) => (b.date > a.date ? 1 : -1));
  else rows.sort((a, b) => a.order - b.order);
  return rows.map(({ path, label, status }) => ({ path, label, status }));
}

export interface MediaItem { path: string; name: string; url: string }

/** Browse all images already uploaded in a media directory (for the picker). */
export async function listImages(dir: string): Promise<MediaItem[]> {
  try {
    const files = await listDir(dir);
    return files
      .filter((f) => f.type === 'file' && /\.(jpe?g|png|webp|avif|gif)$/i.test(f.name))
      .map((f) => ({ path: `/${f.path}`, name: f.name, url: rawImageUrl(f.path) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Persist a new order for a folder collection by writing each entry's `order`
 * field to match its position. Sequential commits (small N). */
export async function saveOrder(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i++) {
    const { content, sha } = await readFile(paths[i]);
    if (content == null) continue;
    const doc = parse(content);
    if (doc.data.order === i) continue; // no change
    doc.data.order = i;
    const { stringify } = await import('./frontmatter');
    await writeFile(paths[i], stringify(doc), `studio: reorder (${i})`, sha);
  }
}

/** Duplicate an entry: read it, append " copy" to the label, return the new
 * draft content (caller saves it as a new file). */
export async function duplicateEntry(path: string, labelField: string) {
  const { content } = await readFile(path);
  const doc = parse(content || '');
  if (doc.data[labelField]) doc.data[labelField] = `${doc.data[labelField]} (copy)`;
  // copies start hidden
  if ('published' in doc.data) doc.data.published = false;
  if ('draft' in doc.data) doc.data.draft = true;
  return doc;
}
