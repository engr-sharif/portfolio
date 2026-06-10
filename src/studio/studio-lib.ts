/**
 * Studio helpers that compose the api + schema (kept out of api.ts so api stays
 * a thin transport layer).
 */
import { login as apiLogin, clearToken, isLoggedIn as apiIsLoggedIn, listDir, readFile } from './api';
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
