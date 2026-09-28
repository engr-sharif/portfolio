import { useEffect, useMemo, useState, type FC } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Eye, EyeOff, History as HistoryIcon, Save, Trash2, MoreHorizontal, Copy, Link2, ExternalLink, ShieldAlert } from 'lucide-react';
import type { Collection, Field as FieldDef } from '../../schema';
import { readFile, isSessionExpired, isConflict, isMissingRoute, sendPreview, commitBuildState, branchOrigin, type HistoryEntry } from '../../api';
import { parse, stringify, cleanForSchema } from '../../frontmatter';
import { validateEntry, type FieldErrors } from '../../../content/schemas';
import { uniqueEntryPath, timeAgo } from '../../studio-lib';
import { useSaveEntry, useDeleteEntry, useDuplicate, useWatchList } from '../../app/queries';
import { scanEntry, KIND_INFO, type Finding } from '../../confidentiality';
import { GoLive, isCleared, findingKey, whereLabel, revealField } from './GoLive';
import { useToast } from '../../ui/Toaster';
import { Button, Callout, Confirm, Dialog, IconButton, Kbd, Menu, Pill, Skeleton } from '../../ui/primitives';
import { Field } from './Field';
import { HistoryDrawer } from './HistoryDrawer';
import { BlockEditor } from './block/BlockEditor';
import { LocationPicker } from './LocationPicker';
import { PreviewPane } from '../../PreviewPane';

interface Props { collection: Collection; path: string | null; onDirtyChange?: (d: boolean) => void }

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const slugOf = (path: string) => (path.split('/').pop() || '').replace(/\.mdx?$/, '');

/* ---- local drafts: every edit mirrored to localStorage (debounced) ---- */
interface Draft { data: Record<string, any>; body: string; at: number }
const draftKey = (cid: string, path: string | null) => `studio.draft:${cid}:${path ?? 'new'}`;
const loadDraft = (k: string): Draft | null => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
const saveDraft = (k: string, d: Draft) => { try { localStorage.setItem(k, JSON.stringify(d)); } catch { /* quota */ } };
const clearDraft = (k: string) => { try { localStorage.removeItem(k); } catch { /* noop */ } };
/* findings the author has looked at and accepted, per entry, on this device */
const reviewKey = (cid: string, path: string | null) => `studio.reviewed:${cid}:${path ?? 'new'}`;
const loadReviewed = (k: string) => { try { return new Set<string>(JSON.parse(localStorage.getItem(k) || '[]')); } catch { return new Set<string>(); } };
const storeReviewed = (k: string, s: Set<string>) => { try { localStorage.setItem(k, JSON.stringify([...s])); } catch { /* quota */ } };
const same = (a: { data: any; body: string }, b: { data: any; body: string }) => JSON.stringify(a.data) === JSON.stringify(b.data) && (a.body ?? '') === (b.body ?? '');

/** Fields that belong in the publish sidebar rather than the main column. */
const SIDE = new Set(['published', 'draft', 'featured', 'status', 'order', 'pubDate', 'updatedDate', 'startDate', 'endDate', 'resumeUpdated', 'category']);
const isSide = (f: FieldDef) => SIDE.has(f.name) || f.type === 'boolean' || f.type === 'date';

/**
 * The entry editor: schema-driven fields, the markdown body, a live preview,
 * a publish sidebar, version history, local drafts, and ⌘S to save.
 * Saving is one commit; the toast tracks it until the site is rebuilt.
 */
export const EditorPage: FC<Props> = ({ collection, path, onDirtyChange }) => {
  const [, navigate] = useLocation();
  const { toast, update, publish } = useToast();
  const save = useSaveEntry(collection.id);
  const del = useDeleteEntry(collection.id);
  const dup = useDuplicate(collection);
  const isFile = collection.kind === 'file';
  const hasBody = !isFile && !!collection.bodyLabel;
  const listHref = isFile ? '/' : `/c/${collection.id}`;

  const [data, setData] = useState<Record<string, any>>({});
  const [body, setBody] = useState('');
  const [sha, setSha] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(path);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(() => { try { return localStorage.getItem('studio.preview') === '1'; } catch { return false; } });
  const [history, setHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [reviewed, setReviewed] = useState(() => loadReviewed(reviewKey(collection.id, path)));
  const [checking, setChecking] = useState<Finding[] | null>(null); // the pre-publish dialog
  const [previewing, setPreviewing] = useState(false);
  const watch = useWatchList();
  const key = draftKey(collection.id, path);
  const repoPath = isFile ? collection.file! : filePath;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { if (!dirty || loading) return; const t = setTimeout(() => saveDraft(key, { data, body, at: Date.now() }), 500); return () => clearTimeout(t); }, [data, body, dirty, loading, key]);

  // The confidentiality read, re-run a moment after typing stops.
  const gated = !isFile && !!collection.statusField;
  useEffect(() => {
    if (!gated || loading) return;
    let alive = true;
    const t = setTimeout(() => { scanEntry(data, body, watch.data?.list).then((f) => { if (alive) setFindings(f); }); }, findings ? 700 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [data, body, loading, gated, watch.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const review = (k: string) => setReviewed((s) => { const n = new Set(s); n.add(k); storeReviewed(reviewKey(collection.id, filePath ?? path), n); return n; });

  useEffect(() => {
    (async () => {
      setLoading(true); setError(''); setFieldErrors({});
      try {
        let next = { data: {} as Record<string, any>, body: '' };
        if (isFile) {
          const f = await readFile(collection.file!); setSha(f.sha);
          try { next = { data: f.content ? JSON.parse(f.content) : {}, body: '' }; } catch { throw new Error('This settings file contains invalid JSON. Fix it on GitHub, then reload.'); }
        } else if (path) {
          const f = await readFile(path); setSha(f.sha);
          if (f.content == null) throw new Error('This entry no longer exists in the repo — it may have been deleted elsewhere.');
          const doc = parse(f.content); next = { data: doc.data, body: doc.body };
        } else {
          const seed: Record<string, any> = {}; for (const fl of collection.fields) if (fl.default !== undefined) seed[fl.name] = fl.default;
          next = { data: seed, body: '' }; setSha(null);
        }
        setData(next.data); setBody(next.body); setDirty(false);
        const d = loadDraft(key);
        if (d && !same(d, next)) setPendingDraft(d); else { clearDraft(key); setPendingDraft(null); }
      } catch (e: any) { setError(e.message || 'Could not load this entry.'); }
      finally { setLoading(false); }
    })();
  }, [collection.id, path]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Set a field; a function is applied to its current value (for writes that race, like photo places). */
  const set = (name: string, v: any) => { setData((d) => ({ ...d, [name]: typeof v === 'function' ? v(d[name]) : v })); setDirty(true); if (fieldErrors[name]) setFieldErrors((fe) => { const n = { ...fe }; delete n[name]; return n; }); };
  const setBodyDirty = (v: string) => { setBody(v); setDirty(true); };
  const togglePreview = () => { const n = !preview; setPreview(n); try { localStorage.setItem('studio.preview', n ? '1' : '0'); } catch { /* fine */ } };

  const serialise = (d: Record<string, any>, b: string) => (isFile ? JSON.stringify(d, null, 2) + '\n' : stringify({ data: cleanForSchema(d), body: b }));

  const willBeLive = gated && (collection.statusField === 'draft' ? !data.draft : !!data[collection.statusField!]);

  /** Save, after the gates: clearance (projects) and a read of anything flagged. */
  const requestSave = async () => {
    if (save.isPending) return;
    if (willBeLive && collection.clearance && !isCleared(data.clearance)) {
      setError('Tick the four clearance items under “Before it goes live”, or switch Published off to save a draft.');
      requestAnimationFrame(() => document.querySelector('.golive')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    if (willBeLive) {
      const now = await scanEntry(data, body, watch.data?.list);
      setFindings(now);
      const open = now.filter((f) => !reviewed.has(findingKey(f)));
      if (open.length) { setChecking(open); return; }
    }
    return doSave();
  };
  const publishAnyway = () => {
    const n = new Set(reviewed); checking?.forEach((f) => n.add(findingKey(f)));
    setReviewed(n); storeReviewed(reviewKey(collection.id, filePath ?? path), n);
    setChecking(null);
    void doSave();
  };

  /** Where this entry will be on the site. */
  const target = async () => {
    if (repoPath) return repoPath;
    const p = await uniqueEntryPath(collection.dir!, slugify(String(data[collection.labelField] || 'untitled')));
    return p;
  };
  const sitePath = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${collection.route}${slugOf(p)}/`;

  /** An unlisted preview: this version on its own branch, built by the host. */
  const doPreview = async () => {
    if (previewing || isFile || !collection.route) return;
    const clean = cleanForSchema(data);
    const errs = validateEntry(collection.id, clean);
    if (Object.keys(errs).length) { setFieldErrors(errs); setError('Fix the highlighted fields first. A preview builds the same way the site does.'); return; }
    setPreviewing(true); setError('');
    try {
      const p = await target();
      const res = await sendPreview(`studio: preview ${data[collection.labelField] || ''}`, [{ path: p, content: stringify({ data: clean, body }) }]);
      const origin = branchOrigin(res.branch);
      const href = origin ? `${origin}${sitePath(p)}` : null;
      const copy = () => { if (href) navigator.clipboard?.writeText(href).then(() => toast({ kind: 'success', title: 'Link copied', duration: 2500 })); };
      const id = toast({ kind: 'progress', title: 'Building a preview…', description: href ? <>Unlisted, not indexed, and the live site is unchanged. It will be at <code>{href.replace(/^https:\/\//, '')}</code> in about two minutes.</> : 'Committed to the preview branch. The live site is unchanged.', action: href ? { label: 'Copy link', onClick: copy } : undefined });
      const since = Date.now();
      const poll = async () => {
        const st = await commitBuildState(res.commit);
        if (st.state === 'live') return update(id, { kind: 'success', title: 'Preview ready', description: 'Only people with the link can find it.', href: href ?? undefined, action: href ? { label: 'Open', onClick: () => window.open(href, '_blank', 'noopener') } : undefined, duration: 20000 });
        if (st.state === 'failed') return update(id, { kind: 'error', title: 'Preview build failed', description: 'Nothing on the live site changed. Open the log to see why.', action: st.url ? { label: 'Open log', onClick: () => window.open(st.url, '_blank', 'noopener') } : undefined, duration: 30000 });
        if (Date.now() - since > 5 * 60_000) return update(id, { kind: 'info', title: 'Preview committed', description: href ? 'It is taking longer than usual; the link will work once the build finishes.' : 'Check the host for the preview build.', action: href ? { label: 'Copy link', onClick: copy } : undefined, duration: 15000 });
        setTimeout(poll, 8000);
      };
      setTimeout(poll, 10000);
    } catch (e: any) {
      if (isMissingRoute(e)) setError('Previews need the updated Studio Worker. Redeploy studio-worker/worker.js, then try again.');
      else if (isSessionExpired(e)) setError('Your session expired. Sign in again — your edits are still here.');
      else setError(e?.message || 'The preview could not be made.');
    } finally { setPreviewing(false); }
  };

  const doSave = async () => {
    if (save.isPending) return;
    setError(''); setNotice(''); setFieldErrors({});
    try {
      let target = repoPath; let content: string; let message: string;
      if (isFile) { content = JSON.stringify(data, null, 2) + '\n'; message = `studio: update ${collection.label}`; }
      else {
        const clean = cleanForSchema(data);
        const errs = validateEntry(collection.id, clean);
        if (Object.keys(errs).length) {
          setFieldErrors(errs);
          const first = collection.fields.find((f) => errs[f.name]);
          setError(`Fix ${Object.keys(errs).length === 1 ? 'the highlighted field' : `${Object.keys(errs).length} highlighted fields`} before publishing.`);
          requestAnimationFrame(() => document.getElementById(`f-${first?.name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          return;
        }
        if (!target) { target = await uniqueEntryPath(collection.dir!, slugify(String(data[collection.labelField] || 'untitled'))); setFilePath(target); }
        content = stringify({ data: clean, body }); message = `studio: ${path ? 'update' : 'create'} ${data[collection.labelField] || ''}`;
      }
      const res = await save.mutateAsync({ path: target!, content, message, sha });
      setSha(res.sha ?? null); setDirty(false); clearDraft(key);
      publish(res.commit);
      if (!path && !isFile) navigate(`/c/${collection.id}/e/${slugOf(target!)}`, { replace: true });
    } catch (e: any) {
      if (isSessionExpired(e)) setError('Your session expired. Sign in again — your edits are still here.');
      else if (isConflict(e)) setError('Someone (or another tab) changed this entry since you opened it. Copy your changes, reload the entry, and re-apply them.');
      else setError(e?.message || 'Save failed.');
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!checking) void requestSave(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }); // intentionally re-bound each render to see fresh state

  const doDelete = async () => {
    if (!filePath || !sha) return;
    try { const r = await del.mutateAsync({ path: filePath, message: `studio: delete ${data[collection.labelField] || ''}`, sha }); clearDraft(key); setDirty(false); publish(r.commit, 'Publishing deletion'); navigate(listHref); }
    catch (e: any) { setError(e?.message || 'Delete failed.'); setConfirmDelete(false); }
  };
  const back = () => { if (dirty && !confirm('You have unsaved changes. Discard them and leave?')) return; clearDraft(key); setDirty(false); navigate(listHref); };
  const restoreVersion = (content: string, entry: HistoryEntry) => {
    try {
      if (isFile) setData(JSON.parse(content)); else { const doc = parse(content); setData(doc.data); setBody(doc.body); }
      setDirty(true); setFieldErrors({}); setError(''); setHistory(false);
      setNotice(`Restored the version from ${timeAgo(entry.date) || entry.sha.slice(0, 7)}. Review it, then Save to make it live.`);
    } catch (e: any) { setHistory(false); setError(e?.message || 'That version could not be read.'); }
  };

  // Projects carry lat/lng (+ a label): those become a map picker card.
  const hasGeo = useMemo(() => ['lat', 'lng'].every((n) => collection.fields.some((f) => f.name === n)), [collection]);
  const GEO = new Set(['lat', 'lng', 'location', 'privacy']);
  const mainFields = useMemo(() => collection.fields.filter((f) => !isSide(f) && !(hasGeo && GEO.has(f.name))), [collection, hasGeo]); // eslint-disable-line react-hooks/exhaustive-deps
  // with a clearance checklist, the Published switch lives in that card instead
  const sideFields = useMemo(() => collection.fields.filter((f) => isSide(f) && !(collection.clearance && f.name === collection.statusField)), [collection]);
  const locationField = collection.fields.find((f) => f.name === 'location');
  const privacyField = collection.fields.find((f) => f.name === 'privacy');
  const title = isFile ? collection.label : (data[collection.labelField] || (path ? collection.label : `New ${collection.label.replace(/s$/, '').toLowerCase()}`));
  const status = collection.statusField ? (collection.statusField === 'draft' ? (data.draft ? 'draft' : 'live') : (data.published ? 'live' : 'draft')) : null;
  const errorCount = Object.keys(fieldErrors).length;

  if (loading) return <div className="page ed"><div className="ed__head"><Skeleton w={90} h={32} /><Skeleton w={220} h={28} /></div><div className="ed__grid"><div className="ed__main"><Skeleton h={40} /><Skeleton h={120} /><Skeleton h={40} /></div><div className="ed__aside"><Skeleton h={160} /></div></div></div>;

  return (
    <div className={`page ed${preview && hasBody ? ' ed--preview' : ''}`}>
      <div className="ed__head">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={back}>{isFile ? 'Dashboard' : collection.label}</Button>
        <div className="ed__titlewrap">
          <h1 className="ed__title">{title}</h1>
          <div className="ed__meta">
            {status && <Pill tone={status === 'live' ? 'live' : 'draft'} dot>{status}</Pill>}
            {dirty ? <span className="ed__dirty" title="Unsaved changes are kept locally until you save">● unsaved</span> : sha ? <span className="ed__saved">saved</span> : <span className="ed__saved">new</span>}
            {repoPath && <code className="ed__path">{repoPath}</code>}
          </div>
        </div>
        <div className="ed__actions">
          {hasBody && <Button variant="ghost" size="sm" icon={preview ? <EyeOff size={15} /> : <Eye size={15} />} onClick={togglePreview} aria-pressed={preview}>Preview</Button>}
          {repoPath && sha && <Button variant="ghost" size="sm" icon={<HistoryIcon size={15} />} onClick={() => setHistory(true)}>History</Button>}
          {collection.route && <Button variant="ghost" size="sm" icon={<Link2 size={15} />} loading={previewing} onClick={doPreview} title="Build this version at an unlisted address to read it as a visitor would, or to send for review. The live site doesn’t change.">Preview link</Button>}
          {!isFile && filePath && sha && (
            <Menu open={menu} setOpen={setMenu} trigger={(p) => <IconButton variant="ghost" size="sm" label="More" icon={<MoreHorizontal size={16} />} {...p} />}
              items={[...(collection.route && status === 'live' && !dirty ? [{ label: 'Open on the site', icon: <ExternalLink size={14} />, onSelect: () => window.open(sitePath(filePath), '_blank', 'noopener') }] : []), { label: 'Duplicate as draft', icon: <Copy size={14} />, onSelect: () => dup.mutate({ path: filePath, label: title }, { onSuccess: ({ path: p, commit }) => { toast({ kind: 'success', title: 'Duplicated as a draft', action: { label: 'Open', onClick: () => navigate(`/c/${collection.id}/e/${slugOf(p)}`) } }); publish(commit); }, onError: (e: any) => toast({ kind: 'error', title: 'Could not duplicate', description: e?.message }) }) }, { label: 'Delete…', icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirmDelete(true) }]} />
          )}
          <Button variant="primary" size="sm" icon={<Save size={15} />} loading={save.isPending} onClick={() => void requestSave()} kbd="⌘S">{!gated ? 'Save' : willBeLive ? 'Save & publish' : 'Save draft'}</Button>
        </div>
      </div>

      {pendingDraft && (
        <Callout tone="warn">
          <strong>Unsaved draft found</strong> from {new Date(pendingDraft.at).toLocaleString()}, newer than what's published.
          <span className="callout__actions"><Button size="sm" variant="primary" onClick={() => { setData(pendingDraft.data); setBody(pendingDraft.body ?? ''); setDirty(true); setPendingDraft(null); }}>Restore draft</Button><Button size="sm" variant="ghost" onClick={() => { clearDraft(key); setPendingDraft(null); }}>Discard</Button></span>
        </Callout>
      )}
      {error && <Callout tone="danger">{error}{errorCount > 1 && <span className="callout__count"> · {errorCount} issues</span>}</Callout>}
      {notice && <Callout tone="success" onDismiss={() => setNotice('')}>{notice}</Callout>}

      <div className="ed__grid">
        <div className="ed__main">
          <section className="ed__card">
            {mainFields.map((f) => <Field key={f.name} field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} onSibling={set} siblings={data} error={fieldErrors[f.name]} />)}
          </section>
          {hasBody && (
            <section className="ed__card">
              <span className="sf__label">{collection.bodyLabel}</span>
              <BlockEditor value={body} onChange={setBodyDirty} mediaDir={collection.mediaDir} />
            </section>
          )}
        </div>
        <aside className="ed__aside">
          {hasGeo && (
            <section className="ed__card ed__card--side">
              <h2 className="ed__cardtitle">Location</h2>
              <LocationPicker lat={typeof data.lat === 'number' ? data.lat : undefined} lng={typeof data.lng === 'number' ? data.lng : undefined} onChange={(lat, lng) => { setData((d) => ({ ...d, lat, lng })); setDirty(true); }} />
              {locationField && <Field field={locationField} value={data.location} onChange={(v) => set('location', v)} error={fieldErrors.location} />}
              {privacyField && <Field field={privacyField} value={data.privacy} onChange={(v) => set('privacy', v)} error={fieldErrors.privacy} />}
            </section>
          )}
          {gated && <GoLive collection={collection} data={data} set={set} findings={findings} reviewed={reviewed} onReview={review} />}
          {sideFields.length > 0 && (
            <section className="ed__card ed__card--side">
              <h2 className="ed__cardtitle">Publishing</h2>
              {sideFields.map((f) => <Field key={f.name} field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} onSibling={set} siblings={data} error={fieldErrors[f.name]} />)}
            </section>
          )}
          <section className="ed__card ed__card--side ed__help">
            <h2 className="ed__cardtitle">How saving works</h2>
            <p>Save makes one commit to the repo. The site rebuilds in about two minutes; the toast tells you when it's live.</p>
            <p>Edits are mirrored to this browser as you type, so a closed tab never loses work.</p>
            <p><Kbd>⌘S</Kbd> save · <Kbd>⌘K</Kbd> jump anywhere</p>
          </section>
        </aside>
        {preview && hasBody && (
          <div className="ed__preview"><PreviewPane body={body} title={data[collection.labelField]} cover={data.coverImage} coverDir={collection.mediaDir} /></div>
        )}
      </div>

      {history && repoPath && (
        <HistoryDrawer path={repoPath} current={serialise(data, body)} onRestore={restoreVersion} onClose={() => setHistory(false)}
          normalize={(c) => { try { if (isFile) return JSON.stringify(JSON.parse(c), null, 2) + '\n'; const d = parse(c); return stringify({ data: cleanForSchema(d.data), body: d.body }); } catch { return c; } }} />
      )}
      <Dialog open={!!checking} onClose={() => setChecking(null)} width={560}
        title={<><ShieldAlert size={18} aria-hidden /> Read these before it goes live</>}
        footer={<><Button variant="ghost" onClick={() => { const f = checking?.[0]; setChecking(null); if (f) requestAnimationFrame(() => revealField(f.field)); }}>Go back and edit</Button><Button variant="primary" onClick={publishAnyway}>They’re fine — publish</Button></>}>
        <p className="dlg__text">The check found {checking?.length === 1 ? 'one thing' : `${checking?.length} things`} that often shouldn’t be public. Each may be fine: a regulatory limit reads like a lab result. Publishing marks them reviewed for this entry.</p>
        <ul className="golive__findings golive__findings--dlg">
          {checking?.map((f, i) => (
            <li key={i} className="finding">
              <div className="finding__go">
                <span className="finding__kind">{KIND_INFO[f.kind].title} <span className="finding__where">· {whereLabel(collection, f.field)}</span></span>
                <span className="finding__ctx">{f.before}<mark>{f.match}</mark>{f.after}</span>
                <span className="finding__why">{KIND_INFO[f.kind].why}</span>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={doDelete} busy={del.isPending} danger title={`Delete “${title}”?`} confirmLabel="Delete" body="This commits a deletion to the repo. History keeps the file, so it can be restored from a commit." />
    </div>
  );
};
