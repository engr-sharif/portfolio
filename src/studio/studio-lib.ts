/**
 * Studio helpers that compose the api + schema (kept out of api.ts so api stays
 * a thin transport layer).
 */
import { login as apiLogin, clearToken, isLoggedIn as apiIsLoggedIn, listDir, readFile, writeFile, rawImageUrl } from './api';
import { parse, stringify } from './frontmatter';
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

export interface EntryRow { path: string; label: string; status?: string; broken?: boolean }

/** List entries of a folder collection with their label + status, newest first.
 * An entry whose frontmatter can't be parsed is still listed (flagged
 * `broken`) so it can be opened and repaired rather than silently vanishing. */
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
        return { path: f.path, label: String(data[collection.labelField] || f.name), status, order: Number(data.order ?? 0), date: String(data.pubDate ?? ''), broken: false };
      } catch {
        return { path: f.path, label: f.name, status: 'broken', order: 0, date: '', broken: true };
      }
    }),
  );
  // Sort: projects/tools by order; blog by date desc.
  if (collection.id === 'blog') rows.sort((a, b) => (b.date > a.date ? 1 : -1));
  else rows.sort((a, b) => a.order - b.order);
  return rows.map(({ path, label, status, broken }) => ({ path, label, status, broken }));
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
 * field to match its position. Sequential commits (small N); reports partial
 * failure so the author knows which items didn't move. */
export async function saveOrder(paths: string[]): Promise<void> {
  const failed: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    try {
      const { content, sha } = await readFile(paths[i]);
      if (content == null) continue;
      const doc = parse(content);
      if (doc.data.order === i) continue; // no change
      doc.data.order = i;
      await writeFile(paths[i], stringify(doc), `studio: reorder (${i})`, sha);
    } catch {
      failed.push(paths[i].split('/').pop() || paths[i]);
    }
  }
  if (failed.length) throw new Error(`Saved most of the order, but these didn't update: ${failed.join(', ')}. Reload and try again.`);
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

/** Find a free path for a new entry: `<dir>/<slug>.md`, then `-2`, `-3`, …
 * so a second "Field Notes" post never silently overwrites the first. */
export async function uniqueEntryPath(dir: string, slug: string): Promise<string> {
  const base = slug || 'untitled';
  for (let n = 1; n < 50; n++) {
    const candidate = `${dir}/${base}${n === 1 ? '' : `-${n}`}.md`;
    const { sha } = await readFile(candidate);
    if (!sha) return candidate;
  }
  return `${dir}/${base}-${Date.now()}.md`;
}

export const AI_GUIDE_PATH = 'src/content/settings/ai.json';

/** The AI writing guide (from settings/ai.json). Empty string means "use the
 * Worker's built-in default guide". Cached until the guide is saved. */
let _aiGuide: string | undefined;
export async function aiGuide(): Promise<string> {
  if (_aiGuide !== undefined) return _aiGuide;
  try {
    const f = await readFile(AI_GUIDE_PATH);
    _aiGuide = f.content ? (JSON.parse(f.content).guide || '') : '';
  } catch { _aiGuide = ''; }
  return _aiGuide ?? '';
}
/** Call after saving ai.json so the next assist uses the new guide. */
export const invalidateAiGuide = () => { _aiGuide = undefined; };
