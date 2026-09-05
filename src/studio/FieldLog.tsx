import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { getCollection } from './schema';
import { listEntries, uniqueEntryPath, timeAgo } from './studio-lib';
import { commitFiles, uploadImage, writeFile, isMissingRoute, isLoggedIn } from './api';
import { processImage, readImageMeta } from './image-process';
import { buildFieldNote, fieldNoteSlug } from './fieldlog-build';
import { listCaptures, saveCapture, deleteCapture, newId, storageInfo, type Capture, type CapturePhoto } from './fieldlog-store';

/**
 * Field log — capture on site with no signal, publish when back in range.
 *
 * Captures (title, note, GPS fix, photos) are written to IndexedDB on this
 * device the moment you tap Save; nothing needs the network. Publish turns a
 * capture into a Field Notes DRAFT: photos are optimised in the browser and
 * committed together with the markdown as ONE atomic commit (the Worker's
 * /api/commit), so a note can never land without its photos. The draft then
 * opens in the normal editor for polishing before it goes live.
 */
interface Props { onPublished: (commit?: string | null) => void; onOpen: (path: string) => void }

const PROJECTS_KEY = 'studio.fieldlog.projects'; // last-seen project list, so the picker works offline
type ProjectOpt = { slug: string; label: string };

const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`);
const stripDataUrl = (s: string) => s.replace(/^data:[^,]*,/, '');
const readAsDataUrl = (file: Blob) =>
  new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read that photo.')); r.readAsDataURL(file); });
const extOf = (name: string, type: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || type.split('/')[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');

export const FieldLog: FC<Props> = ({ onPublished, onOpen }) => {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [captures, setCaptures] = useState<Capture[] | null>(null);
  const [projects, setProjects] = useState<ProjectOpt[]>(() => { try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); } catch { return []; } });
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [error, setError] = useState('');

  // form
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [project, setProject] = useState('');
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listCaptures().then(setCaptures).catch((e) => { setCaptures([]); setError(e?.message || 'Could not open the capture store.'); });

  useEffect(() => {
    refresh();
    storageInfo().then(setStorage);
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Refresh the project picker whenever we're online; cached for the field.
  useEffect(() => {
    if (!online || !isLoggedIn()) return;
    const col = getCollection('projects');
    if (!col) return;
    listEntries(col).then((rows) => {
      const opts = rows.map((r) => ({ slug: (r.path.split('/').pop() || '').replace(/\.mdx?$/, ''), label: r.label }));
      setProjects(opts);
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(opts)); } catch { /* fine */ }
    }).catch(() => { /* keep the cached list */ });
  }, [online]);

  // Object URLs for thumbnails; revoked when the list changes.
  const thumbs = useMemo(() => new Map(photos.map((p) => [p.id, URL.createObjectURL(p.blob)])), [photos]);
  useEffect(() => () => { for (const u of thumbs.values()) URL.revokeObjectURL(u); }, [thumbs]);

  const locate = () => {
    if (!navigator.geolocation) { setError('This device has no location service available to the browser.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setFix({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6), accuracy: Math.round(pos.coords.accuracy) }); setLocating(false); },
      (err) => { setLocating(false); setError(err.code === 1 ? 'Location permission was refused. You can type coordinates instead.' : 'Could not get a GPS fix. Try again outdoors, or type coordinates.'); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const added: CapturePhoto[] = [];
    for (const f of Array.from(files)) {
      let meta: { lat?: number; lng?: number; takenAt?: string } = {};
      try { meta = await readImageMeta(f); } catch { /* no EXIF */ }
      added.push({ id: newId(), name: f.name, type: f.type || 'image/jpeg', size: f.size, blob: f, ...meta });
    }
    setPhotos((p) => [...p, ...added]);
    // First photo with GPS fills an empty location — the phone already knew where you were.
    const withGps = added.find((p) => p.lat != null && p.lng != null);
    if (!fix && withGps) setFix({ lat: withGps.lat!, lng: withGps.lng! });
    if (fileInput.current) fileInput.current.value = '';
  };

  const canSave = title.trim() || note.trim() || photos.length;
  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      const c: Capture = {
        id: newId(), createdAt: new Date().toISOString(), title: title.trim(), note: note.trim(), project: project || undefined,
        lat: fix?.lat, lng: fix?.lng, accuracy: fix?.accuracy, photos, status: 'saved',
      };
      await saveCapture(c);
      setTitle(''); setNote(''); setProject(''); setFix(null); setPhotos([]);
      await refresh(); storageInfo().then(setStorage);
    } catch (e: any) { setError(e?.message || 'Could not save on this device.'); }
    finally { setSaving(false); }
  };

  const publish = async (c: Capture) => {
    if (!online) { setError('You are offline. The capture is safe here; publish when you have signal.'); return; }
    setError('');
    const mark = async (patch: Partial<Capture>) => { const next = { ...c, ...patch }; c = next; await saveCapture(next); await refresh(); };
    await mark({ status: 'publishing', error: undefined });
    try {
      // Unique slug first (needs the network), then build note + photo paths from it.
      const wantSlug = fieldNoteSlug(c.title, c.createdAt);
      const blogDir = getCollection('blog')!.dir!;
      const path = await uniqueEntryPath(blogDir, wantSlug);
      const slug = (path.split('/').pop() || wantSlug).replace(/\.md$/, '');
      const processed = [] as { path: string; base64: string }[];
      const photoDefs = [] as { ext: string; alt?: string; takenAt?: string }[];
      for (const p of c.photos) {
        const file = new File([p.blob], p.name, { type: p.type });
        const { file: out } = await processImage(file);
        photoDefs.push({ ext: extOf(out.name, out.type), takenAt: p.takenAt });
        processed.push({ path: '', base64: stripDataUrl(await readAsDataUrl(out)) });
      }
      const built = buildFieldNote({ title: c.title, note: c.note, createdAt: c.createdAt, lat: c.lat, lng: c.lng, project: c.project, photos: photoDefs }, { slug });
      built.photoPaths.forEach((pp, i) => { processed[i].path = pp; });
      const message = `studio: field log — ${built.data.title}`;
      let commit: string | null | undefined;
      try {
        const r = await commitFiles(message, [
          ...processed.map((p) => ({ path: p.path, content: p.base64, encoding: 'base64' as const })),
          { path: built.path, content: built.content },
        ]);
        commit = r.commit;
      } catch (e) {
        if (!isMissingRoute(e)) throw e;
        // Older Worker: one upload per photo, then the note.
        for (const p of processed) await uploadImage(p.path, `data:image/jpeg;base64,${p.base64}`, `studio: field log photo`);
        commit = (await writeFile(built.path, built.content, message)).commit;
      }
      await mark({ status: 'published', publishedPath: built.path, commit: commit || undefined, photos: [] }); // drop blobs: they live in the repo now
      onPublished(commit);
    } catch (e: any) {
      await mark({ status: 'saved', error: e?.message || 'Publish failed. The capture is still on this device.' });
    }
  };

  const remove = async (c: Capture) => {
    if (c.status !== 'published' && !confirm('Delete this capture from this device? It has not been published.')) return;
    await deleteCapture(c.id); await refresh(); storageInfo().then(setStorage);
  };

  const pending = captures?.filter((c) => c.status !== 'published') ?? [];
  const done = captures?.filter((c) => c.status === 'published') ?? [];

  return (
    <div className="st-fl">
      <header className="st-list__head">
        <div>
          <h1 className="st-page-title">Field log</h1>
          <p className="st-fl__sub">Capture on site, publish when you have signal. Everything here stays on this device until you publish.</p>
        </div>
        <span className={`st-fl__net u-mono${online ? ' is-on' : ''}`} aria-live="polite">{online ? 'online' : 'offline'}</span>
      </header>

      {error && <div className="st-error" role="alert">{error}</div>}
      {online && pending.length > 0 && (
        <div className="st-notice"><span>You're online — {pending.length} capture{pending.length === 1 ? '' : 's'} ready to publish as Field Notes drafts.</span></div>
      )}

      <section className="st-fl__form" aria-labelledby="st-fl-new">
        <h2 id="st-fl-new" className="st-fl__h2">New capture</h2>
        <label className="sf">
          <span className="sf__label">Title</span>
          <input className="sf__input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cell 4 liner seams — north slope" autoComplete="off" />
        </label>
        <label className="sf">
          <span className="sf__label">Notes <span className="st-fl__hint">(Markdown is fine)</span></span>
          <textarea className="sf__input st-fl__note" rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you saw, measured, flagged…" />
        </label>
        <div className="st-fl__row">
          <label className="sf st-fl__grow">
            <span className="sf__label">Related project</span>
            <select className="sf__input" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">— none —</option>
              {projects.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
            </select>
          </label>
          <div className="sf st-fl__grow">
            <span className="sf__label">Location</span>
            <div className="st-fl__loc">
              <button type="button" className="st-btn st-btn--toggle" onClick={locate} disabled={locating}>{locating ? 'Getting fix…' : fix ? 'Re-fix' : 'Use my location'}</button>
              <input className="sf__input st-fl__coord" inputMode="decimal" placeholder="lat" value={fix?.lat ?? ''} onChange={(e) => setFix({ lat: Number(e.target.value), lng: fix?.lng ?? 0 })} aria-label="Latitude" />
              <input className="sf__input st-fl__coord" inputMode="decimal" placeholder="lng" value={fix?.lng ?? ''} onChange={(e) => setFix({ lat: fix?.lat ?? 0, lng: Number(e.target.value) })} aria-label="Longitude" />
            </div>
            {fix?.accuracy != null && <p className="st-fl__hint">± {fix.accuracy} m · published rounded to ~1 km</p>}
          </div>
        </div>

        <div className="sf">
          <span className="sf__label">Photos</span>
          <div className="st-fl__photos">
            {photos.map((p) => (
              <figure key={p.id} className="st-fl__thumb">
                <img src={thumbs.get(p.id)} alt="" />
                <button type="button" className="st-fl__thumb-x" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}>✕</button>
                <figcaption className="u-mono">{fmtBytes(p.size)}{p.lat != null ? ' · gps' : ''}</figcaption>
              </figure>
            ))}
            <label className="st-fl__add">
              <input ref={fileInput} type="file" accept="image/*,.heic,.heif" capture="environment" multiple onChange={(e) => addPhotos(e.target.files)} />
              <span>＋ Camera / photos</span>
            </label>
          </div>
          <p className="st-fl__hint">Photos are kept full-size on this device and optimised (HEIC → JPEG, 2400 px) when you publish.</p>
        </div>

        <div className="st-fl__actions">
          <button type="button" className="st-btn st-btn--primary" onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save on this device'}</button>
          {storage && storage.quota > 0 && <span className="st-fl__hint u-mono">{fmtBytes(storage.quota - storage.usage)} free on device</span>}
        </div>
      </section>

      <section aria-labelledby="st-fl-pending">
        <h2 id="st-fl-pending" className="st-fl__h2">On this device {captures && <span className="st-fl__count u-mono">{pending.length}</span>}</h2>
        {captures === null && <p className="st-loading">Loading…</p>}
        {captures && pending.length === 0 && <p className="st-list__empty">Nothing waiting. Captures you save appear here until published.</p>}
        <ul className="st-fl__list">
          {pending.map((c) => (
            <li key={c.id} className={`st-fl__card is-${c.status}`}>
              <div className="st-fl__card-main">
                <strong>{c.title || 'Untitled capture'}</strong>
                <span className="st-fl__meta u-mono">{timeAgo(c.createdAt)} · {c.photos.length} photo{c.photos.length === 1 ? '' : 's'}{c.lat != null ? ` · ${c.lat.toFixed(4)}, ${c.lng?.toFixed(4)}` : ''}{c.project ? ` · ${c.project}` : ''}</span>
                {c.note && <p className="st-fl__preview">{c.note.length > 160 ? `${c.note.slice(0, 160)}…` : c.note}</p>}
                {c.error && <p className="sf__err">{c.error}</p>}
              </div>
              <div className="st-fl__card-actions">
                <button type="button" className="st-btn st-btn--primary" onClick={() => publish(c)} disabled={!online || c.status === 'publishing'} title={online ? 'Commit note + photos as one Field Notes draft' : 'Needs signal'}>
                  {c.status === 'publishing' ? 'Publishing…' : 'Publish draft'}
                </button>
                <button type="button" className="st-btn st-btn--danger" onClick={() => remove(c)} disabled={c.status === 'publishing'}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {done.length > 0 && (
        <section aria-labelledby="st-fl-done">
          <h2 id="st-fl-done" className="st-fl__h2">Published from this device</h2>
          <ul className="st-fl__list">
            {done.map((c) => (
              <li key={c.id} className="st-fl__card is-published">
                <div className="st-fl__card-main">
                  <strong>{c.title || 'Untitled capture'}</strong>
                  <span className="st-fl__meta u-mono">draft · {timeAgo(c.createdAt)}{c.commit ? ` · ${c.commit.slice(0, 7)}` : ''}</span>
                </div>
                <div className="st-fl__card-actions">
                  {c.publishedPath && <button type="button" className="st-btn" onClick={() => onOpen(c.publishedPath!)}>Open in editor</button>}
                  <button type="button" className="st-btn st-btn--ghost" onClick={() => remove(c)}>Remove from device</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
