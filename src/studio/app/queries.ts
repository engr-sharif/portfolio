/**
 * Data layer — TanStack Query hooks over the Worker API. Every screen reads
 * through here so caches stay coherent: a save invalidates the entry, its
 * collection list, its history and the dashboard stats in one place.
 * Reorders are optimistic (the table moves instantly, the commit follows).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Collection } from '../schema';
import { readFile, writeFile, deleteFile, commitFiles, history, listDir, type HistoryEntry, type FileResult } from '../api';
import { listEntries, getStats, saveOrder, duplicateEntry, uniqueEntryPath, listImages, type EntryRow, type CollStat, type MediaItem } from '../studio-lib';
import { parse, stringify } from '../frontmatter';

export const keys = {
  entries: (id: string) => ['entries', id] as const,
  entry: (path: string) => ['entry', path] as const,
  stats: ['stats'] as const,
  history: (path?: string) => ['history', path ?? '*'] as const,
  media: (dir: string) => ['media', dir] as const,
  dir: (dir: string) => ['dir', dir] as const,
};

export const useEntries = (collection: Collection) =>
  useQuery<EntryRow[]>({ queryKey: keys.entries(collection.id), queryFn: () => listEntries(collection), enabled: collection.kind === 'folder', staleTime: 20_000 });

export const useEntry = (path: string | null) =>
  useQuery<FileResult>({ queryKey: keys.entry(path || ''), queryFn: () => readFile(path!), enabled: !!path, staleTime: 5_000 });

export const useStats = () => useQuery<CollStat[]>({ queryKey: keys.stats, queryFn: getStats, staleTime: 30_000 });

export const useHistory = (path?: string, limit = 20) =>
  useQuery<HistoryEntry[]>({ queryKey: [...keys.history(path), limit], queryFn: () => history(path, limit), staleTime: 15_000 });

export const useMedia = (dir: string) => useQuery<MediaItem[]>({ queryKey: keys.media(dir), queryFn: () => listImages(dir), staleTime: 30_000 });
export const useDir = (dir: string) => useQuery({ queryKey: keys.dir(dir), queryFn: () => listDir(dir), staleTime: 30_000 });

/** Invalidate everything a change to `path` in `collection` could affect. */
export function useInvalidateEntry() {
  const qc = useQueryClient();
  return (collectionId: string, path?: string | null) => {
    qc.invalidateQueries({ queryKey: keys.entries(collectionId) });
    if (path) { qc.invalidateQueries({ queryKey: keys.entry(path) }); qc.invalidateQueries({ queryKey: keys.history(path) }); }
    qc.invalidateQueries({ queryKey: keys.history() });
    qc.invalidateQueries({ queryKey: keys.stats });
  };
}

export interface SaveArgs { path: string; content: string; message: string; sha?: string | null }
export function useSaveEntry(collectionId: string) {
  const inv = useInvalidateEntry();
  return useMutation({
    mutationFn: ({ path, content, message, sha }: SaveArgs) => writeFile(path, content, message, sha),
    onSuccess: (_r, v) => inv(collectionId, v.path),
  });
}

export function useDeleteEntry(collectionId: string) {
  const inv = useInvalidateEntry();
  return useMutation({
    mutationFn: ({ path, message, sha }: { path: string; message: string; sha: string }) => deleteFile(path, message, sha),
    onSuccess: (_r, v) => inv(collectionId, v.path),
  });
}

/** Drag-reorder: the list updates instantly; the ONE commit follows. Rolls back on failure. */
export function useReorder(collection: Collection) {
  const qc = useQueryClient();
  const inv = useInvalidateEntry();
  return useMutation({
    mutationFn: (rows: EntryRow[]) => saveOrder(rows.map((r) => r.path)),
    onMutate: async (rows) => {
      await qc.cancelQueries({ queryKey: keys.entries(collection.id) });
      const previous = qc.getQueryData<EntryRow[]>(keys.entries(collection.id));
      qc.setQueryData(keys.entries(collection.id), rows);
      return { previous };
    },
    onError: (_e, _rows, ctx) => { if (ctx?.previous) qc.setQueryData(keys.entries(collection.id), ctx.previous); },
    onSettled: () => inv(collection.id),
  });
}

export function useDuplicate(collection: Collection) {
  const inv = useInvalidateEntry();
  return useMutation({
    mutationFn: async (row: EntryRow) => {
      const doc = await duplicateEntry(row.path, collection.labelField);
      const base = String(doc.data[collection.labelField] || 'copy').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const newPath = await uniqueEntryPath(collection.dir!, base);
      const res = await writeFile(newPath, stringify(doc), `studio: duplicate ${doc.data[collection.labelField] || ''}`);
      return { path: newPath, commit: res.commit };
    },
    onSuccess: () => inv(collection.id),
  });
}

/** Publish / unpublish / delete several entries as ONE commit. */
export function useBulk(collection: Collection) {
  const inv = useInvalidateEntry();
  return useMutation({
    mutationFn: async ({ rows, action }: { rows: EntryRow[]; action: 'publish' | 'unpublish' | 'delete' }) => {
      const docs = await Promise.all(rows.map(async (r) => ({ row: r, file: await readFile(r.path) })));
      if (action === 'delete') {
        const r = await commitFiles(`studio: delete ${rows.length} ${collection.label.toLowerCase()}`, [], docs.map((d) => ({ path: d.row.path, sha: d.file.sha })));
        return r.commit;
      }
      const field = collection.statusField!;
      const files = docs.flatMap((d) => {
        if (d.file.content == null) return [];
        const doc = parse(d.file.content);
        const live = action === 'publish';
        doc.data[field] = field === 'draft' ? !live : live;
        return [{ path: d.row.path, content: stringify(doc), sha: d.file.sha }];
      });
      const r = await commitFiles(`studio: ${action} ${files.length} ${collection.label.toLowerCase()}`, files);
      return r.commit;
    },
    onSuccess: () => inv(collection.id),
  });
}
