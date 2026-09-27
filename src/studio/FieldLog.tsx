import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { getCollection } from './schema';
import { listEntries, uniqueEntryPath, timeAgo } from './studio-lib';
import { uploadImage, writeFile, isMissingRoute, isLoggedIn } from './api';
import { processImage, readImageMeta, roundCoord } from './image-process';
import { buildFieldNote, fieldNoteSlug } from './fieldlog-build';
import { listCaptures, saveCapture, deleteCapture, newId, storageInfo, type Capture, type CapturePhoto, type CaptureClip, type CaptureMemo } from './fieldlog-store';
import { LIMITS, videoMeta, posterFrom, audioPeaks, audioExt, readB64, fmtBytes as fmtSize } from './media';
import { commitInBatches, type BatchFile } from './media-upload';
import { scrubVideo } from './video-scrub';
import { useRecorder, clock } from './use-recorder';
import { RecordingMeter } from './features/editor/MediaFields';

/**
 * Field log — capture on site with no signal, publish when back in range.
 *
 * Captures (title, note, GPS fix, photos, a voice memo, short clips) are
 * written to IndexedDB on this device the moment you tap Save; nothing needs
 * the network. Publish turns a capture into a Field Notes DRAFT: photos are
 * optimised and stripped of EXIF, clips have their GPS blanked and get a
 * poster frame, the memo gets its waveform — all in the browser — and the
 * files are committed with the note LAST, so a note never lands without the
 * media it shows. The draft then opens in the normal editor for polishing.
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
  const [memo, setMemo] = useState<CaptureMemo | null>(null);
  const [clips, setClips] = useState<CaptureClip[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const clipInput = useRef<HTMLInputElement>(null);
  const mic = useRecorder(({ blob, seconds }) => setMemo({ blob, type: blob.type, seconds }), 15 * 60 * 1000);
  const memoUrl = useMemo(() => (memo ? URL.createObjectURL(memo.blob) : ''), [memo]);
  useEffect(() => () => { if (memoUrl) URL.revokeObjectURL(memoUrl); }, [memoUrl]);
  const clipUrls = useMemo(() => new Map(clips.map((c) => [c.id, URL.createObjectURL(c.blob)])), [clips]);
  useEffect(() => () => { for (const u of clipUrls.values()) URL.revokeObjectURL(u); }, [clipUrls]);

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
      (pos) => { setFix({ lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude), accuracy: Math.round(pos.coords.accuracy) }); setLocating(false); },
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

  const addClips = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const added: CaptureClip[] = [];
    for (const f of Array.from(files)) {
      if (f.size > LIMITS.loopBytes) { setError(`“${f.name}” is ${fmtSize(f.size)}; a clip can be ${fmtSize(LIMITS.loopBytes)}. Record a shorter one, or put it on YouTube.`); continue; }
      try {
        const { duration } = await videoMeta(f);
        if (duration > LIMITS.loopSeconds + 0.5) { setError(`“${f.name}” runs ${Math.round(duration)} s; a clip can be ${LIMITS.loopSeconds} s. Trim it, or put it on YouTube.`); continue; }
        added.push({ id: newId(), name: f.name, type: f.type || 'video/mp4', size: f.size, blob: f, duration });
      } catch (e: any) { setError(e?.message || `Couldn’t read “${f.name}”.`); }
    }
    setClips((c) => [...c, ...added]);
    if (clipInput.current) clipInput.current.value = '';
  };

  const canSave = title.trim() || note.trim() || photos.length || memo || clips.length;
  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      const c: Capture = {
        id: newId(), createdAt: new Date().toISOString(), title: title.trim(), note: note.trim(), project: project || undefined,
        lat: fix?.lat, lng: fix?.lng, accuracy: fix?.accuracy, photos, memo: memo ?? undefined, clips, status: 'saved',
      };
      await saveCapture(c);
      setTitle(''); setNote(''); setProject(''); setFix(null); setPhotos([]); setMemo(null); setClips([]);
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
      const memoPeaks = c.memo ? await audioPeaks(c.memo.blob).then((r) => r.peaks).catch(() => undefined) : undefined;
      const clipFiles = [] as { clip: Blob; poster: Blob; ext: string }[];
      for (const k of c.clips ?? []) {
        const file = new File([k.blob], k.name, { type: k.type });
        const [{ file: clean }, poster] = await Promise.all([scrubVideo(file), posterFrom(file)]);
        clipFiles.push({ clip: clean, poster, ext: /webm/.test(k.type) ? 'webm' : /quicktime/.test(k.type) || /\.mov$/i.test(k.name) ? 'mov' : 'mp4' });
      }
      const built = buildFieldNote({
        title: c.title, note: c.note, createdAt: c.createdAt, lat: c.lat, lng: c.lng, project: c.project, photos: photoDefs,
        memo: c.memo ? { ext: audioExt(c.memo.blob), peaks: memoPeaks } : undefined,
        clips: clipFiles.map((k) => ({ ext: k.ext })),
      }, { slug });
      built.photoPaths.forEach((pp, i) => { processed[i].path = pp; });
      const media: BatchFile[] = processed.map((p) => ({ path: p.path, content: p.base64, encoding: 'base64' }));
      if (c.memo && built.memoPath) media.push({ path: built.memoPath, content: await readB64(c.memo.blob), encoding: 'base64' });
      for (const [i, k] of clipFiles.entries()) {
        media.push({ path: built.clipPaths[i].clip, content: await readB64(k.clip), encoding: 'base64' });
        media.push({ path: built.clipPaths[i].poster, content: await readB64(k.poster), encoding: 'base64' });
      }
      const message = `studio: field log — ${built.data.title}`;
      let commit: string | null | undefined;
      try {
        commit = await commitInBatches(message, [...media, { path: built.path, content: built.content }]);
      } catch (e) {
        if (!isMissingRoute(e)) throw e;
        // Older Worker: one upload per file, then the note.
        for (const m of media) await uploadImage(m.path, `data:application/octet-stream;base64,${m.content}`, 'studio: field log media');
        commit = (await writeFile(built.path, built.content, message)).commit;
      }
      await mark({ status: 'published', publishedPath: built.path, commit: commit || undefined, photos: [], memo: undefined, clips: [] }); // drop blobs: they live in the repo now
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
  const publishAll = async () => {
    setPublishingAll(true);
    try { for (const c of pending.filter((x) => x.status === 'saved')) await publish(c); }
    finally { setPublishingAll(false); }
  };
  const mediaSummary = (c: Capture) => [
    c.photos.length ? `${c.photos.length} photo${c.photos.length === 1 ? '' : 's'}` : '',
    c.clips?.length ? `${c.clips.length} clip${c.clips.length === 1 ? '' : 's'}` : '',
    c.memo ? `${clock(c.memo.seconds)} memo` : '',
  ].filter(Boolean).join(' · ') || 'text only';
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
        <div className="st-notice">
          <span>You're online — {pending.length} capture{pending.length === 1 ? '' : 's'} ready to publish as Field Notes drafts.</span>
          {pending.length > 1 && <button type="button" className="st-btn st-btn--primary" onClick={publishAll} disabled={publishingAll}>{publishingAll ? 'Publishing…' : `Publish all ${pending.length}`}</button>}
        </div>
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
          <p className="st-fl__hint">Photos are kept full-size on this device and optimised (HEIC → JPEG, 2400 px, location removed) when you publish.</p>
        </div>

        <div className="st-fl__row">
          <div className="sf st-fl__grow">
            <span className="sf__label">Voice memo</span>
            {mic.recording ? (
              <div className="st-fl__memo"><RecordingMeter seconds={mic.seconds} level={mic.level} /><button type="button" className="st-btn st-btn--primary" onClick={mic.stop}>Stop</button></div>
            ) : memo ? (
              <div className="st-fl__memo"><audio controls preload="metadata" src={memoUrl} /><button type="button" className="st-btn st-btn--ghost" onClick={() => setMemo(null)} aria-label="Remove the voice memo">✕</button></div>
            ) : (
              <div className="st-fl__memo"><button type="button" className="st-btn st-btn--toggle" onClick={mic.start}>● Record a memo</button></div>
            )}
            {mic.error ? <p className="sf__err">{mic.error}</p> : <p className="st-fl__hint">Say what you’d write. It records offline and becomes the note’s audio.</p>}
          </div>
          <div className="sf st-fl__grow">
            <span className="sf__label">Clips</span>
            <div className="st-fl__photos">
              {clips.map((k) => (
                <figure key={k.id} className="st-fl__thumb">
                  <video src={clipUrls.get(k.id)} muted playsInline preload="metadata" />
                  <button type="button" className="st-fl__thumb-x" onClick={() => setClips((cs) => cs.filter((x) => x.id !== k.id))} aria-label={`Remove ${k.name}`}>✕</button>
                  <figcaption className="u-mono">{Math.round(k.duration)} s · {fmtBytes(k.size)}</figcaption>
                </figure>
              ))}
              <label className="st-fl__add">
                <input ref={clipInput} type="file" accept="video/*" capture="environment" multiple onChange={(e) => addClips(e.target.files)} />
                <span>＋ Clip</span>
              </label>
            </div>
            <p className="st-fl__hint">Up to {LIMITS.loopSeconds} s each, shown silent and looping. Location is removed before upload.</p>
          </div>
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
                <span className="st-fl__meta u-mono">{timeAgo(c.createdAt)} · {mediaSummary(c)}{c.lat != null ? ` · ${c.lat.toFixed(2)}, ${c.lng?.toFixed(2)}` : ''}{c.project ? ` · ${c.project}` : ''}</span>
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
