import { useEffect, useMemo, useState, type FC } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Eye, EyeOff, History as HistoryIcon, Save, Trash2, MoreHorizontal, Copy } from 'lucide-react';
import type { Collection, Field as FieldDef } from '../../schema';
import { readFile, isSessionExpired, isConflict, type HistoryEntry } from '../../api';
import { parse, stringify, cleanForSchema } from '../../frontmatter';
import { validateEntry, type FieldErrors } from '../../../content/schemas';
import { uniqueEntryPath, invalidateAiGuide, AI_GUIDE_PATH, timeAgo } from '../../studio-lib';
import { useSaveEntry, useDeleteEntry, useDuplicate } from '../../app/queries';
import { useToast } from '../../ui/Toaster';
import { Button, Callout, Confirm, IconButton, Kbd, Menu, Pill, Skeleton } from '../../ui/primitives';
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
  const { toast, publish } = useToast();
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
  const key = draftKey(collection.id, path);
  const repoPath = isFile ? collection.file! : filePath;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { if (!dirty || loading) return; const t = setTimeout(() => saveDraft(key, { data, body, at: Date.now() }), 500); return () => clearTimeout(t); }, [data, body, dirty, loading, key]);

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

  const set = (name: string, v: any) => { setData((d) => ({ ...d, [name]: v })); setDirty(true); if (fieldErrors[name]) setFieldErrors((fe) => { const n = { ...fe }; delete n[name]; return n; }); };
  const setBodyDirty = (v: string) => { setBody(v); setDirty(true); };
  const togglePreview = () => { const n = !preview; setPreview(n); try { localStorage.setItem('studio.preview', n ? '1' : '0'); } catch { /* fine */ } };

  const serialise = (d: Record<string, any>, b: string) => (isFile ? JSON.stringify(d, null, 2) + '\n' : stringify({ data: cleanForSchema(d), body: b }));

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
      if (isFile && collection.file === AI_GUIDE_PATH) invalidateAiGuide();
      publish(res.commit);
      if (!path && !isFile) navigate(`/c/${collection.id}/e/${slugOf(target!)}`, { replace: true });
    } catch (e: any) {
      if (isSessionExpired(e)) setError('Your session expired. Sign in again — your edits are still here.');
      else if (isConflict(e)) setError('Someone (or another tab) changed this entry since you opened it. Copy your changes, reload the entry, and re-apply them.');
      else setError(e?.message || 'Save failed.');
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); } };
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
  const GEO = new Set(['lat', 'lng', 'location']);
  const mainFields = useMemo(() => collection.fields.filter((f) => !isSide(f) && !(hasGeo && GEO.has(f.name))), [collection, hasGeo]); // eslint-disable-line react-hooks/exhaustive-deps
  const sideFields = useMemo(() => collection.fields.filter(isSide), [collection]);
  const locationField = collection.fields.find((f) => f.name === 'location');
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
          {!isFile && filePath && sha && (
            <Menu open={menu} setOpen={setMenu} trigger={(p) => <IconButton variant="ghost" size="sm" label="More" icon={<MoreHorizontal size={16} />} {...p} />}
              items={[{ label: 'Duplicate as draft', icon: <Copy size={14} />, onSelect: () => dup.mutate({ path: filePath, label: title }, { onSuccess: ({ path: p, commit }) => { toast({ kind: 'success', title: 'Duplicated as a draft', action: { label: 'Open', onClick: () => navigate(`/c/${collection.id}/e/${slugOf(p)}`) } }); publish(commit); }, onError: (e: any) => toast({ kind: 'error', title: 'Could not duplicate', description: e?.message }) }) }, { label: 'Delete…', icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirmDelete(true) }]} />
          )}
          <Button variant="primary" size="sm" icon={<Save size={15} />} loading={save.isPending} onClick={doSave} kbd="⌘S">{isFile ? 'Save' : 'Save & publish'}</Button>
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
            {mainFields.map((f) => <Field key={f.name} field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} error={fieldErrors[f.name]} />)}
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
            </section>
          )}
          {sideFields.length > 0 && (
            <section className="ed__card ed__card--side">
              <h2 className="ed__cardtitle">Publishing</h2>
              {sideFields.map((f) => <Field key={f.name} field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} error={fieldErrors[f.name]} />)}
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
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={doDelete} busy={del.isPending} danger title={`Delete “${title}”?`} confirmLabel="Delete" body="This commits a deletion to the repo. History keeps the file, so it can be restored from a commit." />
    </div>
  );
};
