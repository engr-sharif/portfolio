/**
 * Offline store for field-log captures. IndexedDB (not localStorage) because
 * captures carry photo blobs. Everything stays on this device until the
 * author publishes; a published capture keeps a record (with the repo path)
 * until they remove it.
 */
export interface CapturePhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  lat?: number;
  lng?: number;
  takenAt?: string;
}
export type CaptureStatus = 'saved' | 'publishing' | 'published' | 'error';
export interface Capture {
  id: string;
  createdAt: string;      // ISO
  title: string;
  note: string;           // markdown
  project?: string;       // related project slug
  lat?: number;
  lng?: number;
  accuracy?: number;      // metres, from the device fix
  photos: CapturePhoto[];
  status: CaptureStatus;
  publishedPath?: string; // repo path of the draft once published
  commit?: string;
  error?: string;
}

const DB = 'studio-fieldlog';
const STORE = 'captures';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('This browser cannot store captures offline.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error || new Error('Could not open the capture store.'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out: IDBRequest<T> | void;
    try { out = run(store); } catch (e) { rej(e); return; }
    t.oncomplete = () => { db.close(); res(out ? (out as IDBRequest<T>).result : (undefined as T)); };
    t.onerror = () => { db.close(); rej(t.error || new Error('Capture store error.')); };
    t.onabort = () => { db.close(); rej(t.error || new Error('Capture store aborted.')); };
  }));
}

export const listCaptures = async (): Promise<Capture[]> => {
  const all = await tx<Capture[]>('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
};
export const saveCapture = (c: Capture) => tx<IDBValidKey>('readwrite', (s) => s.put(c)).then(() => c);
export const deleteCapture = (id: string) => tx<undefined>('readwrite', (s) => s.delete(id));

export const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

/** Rough device storage picture for the UI ("2.1 GB free"). */
export async function storageInfo(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  } catch { return null; }
}
