import { useEffect, useState, type FC } from 'react';
import type { Collection } from './schema';
import { Field } from './Field';
import { MarkdownEditor } from './MarkdownEditor';
import { PreviewPane } from './PreviewPane';
import { History } from './History';
import { readFile, writeFile, deleteFile, isSessionExpired, isConflict, type HistoryEntry } from './api';
import { timeAgo } from './studio-lib';
import { parse, stringify, cleanForSchema } from './frontmatter';
import { validateEntry, type FieldErrors } from '../content/schemas';
import { uniqueEntryPath, invalidateAiGuide, AI_GUIDE_PATH } from './studio-lib';

interface Props {
  collection: Collection;
  path: string | null;       // existing entry path, or null for "new"
  onDone: () => void;        // back to list
  onPublished?: () => void;  // fired after a successful save (for the toast)
  onDirtyChange?: (dirty: boolean) => void; // lets the shell guard navigation
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* ------------------------------------------------------------ local drafts */
// Every edit is mirrored to localStorage (debounced) so a closed tab, an
// expired session, or a crashed save never costs the author their work.
interface Draft { data: Record<string, any>; body: string; at: number }
const draftKey = (collectionId: string, path: string | null) => `studio.draft:${collectionId}:${path ?? 'new'}`;
const loadDraft = (key: string): Draft | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
};
const saveDraft = (key: string, d: Draft) => { try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* quota */ } };
const clearDraft = (key: string) => { try { localStorage.removeItem(key); } catch { /* noop */ } };
const sameContent = (a: Draft | { data: any; body: string }, b: { data: any; body: string }) =>
  JSON.stringify(a.data) === JSON.stringify(b.data) && (a.body ?? '') === (b.body ?? '');

export const Editor: FC<Props> = ({ collection, path, onDone, onPublished, onDirtyChange }) => {
  const [data, setData] = useState<Record<string, any>>({});
  const [body, setBody] = useState('');
  const [sha, setSha] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(path);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false); // unsaved-changes guard
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(() => localStorage.getItem('studio.preview') === '1');
  const [showHistory, setShowHistory] = useState(false);
  const [notice, setNotice] = useState(''); // non-error status (e.g. "restored a version")

  const isFileCollection = collection.kind === 'file';
  const repoPath = isFileCollection ? collection.file! : filePath;
  const hasBody = !isFileCollection && !!collection.bodyLabel;
  const showPreview = preview && hasBody;
  const key = draftKey(collection.id, path);

  const togglePreview = () => {
    const next = !preview;
    setPreview(next);
    localStorage.setItem('studio.preview', next ? '1' : '0');
  };

  // Tell the shell about dirtiness so Back/sidebar/logout can confirm.
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Warn on browser/tab close if there are unsaved edits.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Mirror unsaved edits to localStorage (debounced).
  useEffect(() => {
    if (!dirty || loading) return;
    const t = setTimeout(() => saveDraft(key, { data, body, at: Date.now() }), 500);
    return () => clearTimeout(t);
  }, [data, body, dirty, loading, key]);

  const guardedDone = () => {
    if (dirty && !confirm('You have unsaved changes. Discard them and leave?')) return;
    clearDraft(key);
    onDone();
  };

  useEffect(() => {
    (async () => {
      setLoading(true); setError(''); setFieldErrors({});
      try {
        let next: { data: Record<string, any>; body: string } = { data: {}, body: '' };
        if (isFileCollection) {
          const f = await readFile(collection.file!);
          setSha(f.sha);
          try { next = { data: f.content ? JSON.parse(f.content) : {}, body: '' }; }
          catch { throw new Error('This settings file contains invalid JSON. Fix it on GitHub, then reload.'); }
        } else if (path) {
          const f = await readFile(path);
          setSha(f.sha);
          if (f.content == null) throw new Error('This entry no longer exists in the repo — it may have been deleted elsewhere.');
          const doc = parse(f.content); // throws a readable message on bad YAML
          next = { data: doc.data, body: doc.body };
        } else {
          // new entry: seed defaults
          const seed: Record<string, any> = {};
          for (const fl of collection.fields) if (fl.default !== undefined) seed[fl.name] = fl.default;
          next = { data: seed, body: '' };
          setSha(null);
        }
        setData(next.data); setBody(next.body); setDirty(false);
        // Offer to restore a newer local draft, if one differs from what's saved.
        const d = loadDraft(key);
        if (d && !sameContent(d, next)) setPendingDraft(d); else { clearDraft(key); setPendingDraft(null); }
      } catch (e: any) { setError(e.message || 'Could not load this entry.'); }
      finally { setLoading(false); }
    })();
  }, [collection.id, path]);

  const set = (name: string, v: any) => {
    setData((d) => ({ ...d, [name]: v }));
    setDirty(true);
    if (fieldErrors[name]) setFieldErrors((fe) => { const n = { ...fe }; delete n[name]; return n; });
  };
  const setBodyDirty = (v: string) => { setBody(v); setDirty(true); };

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setData(pendingDraft.data); setBody(pendingDraft.body ?? ''); setDirty(true); setPendingDraft(null);
  };
  const discardDraft = () => { clearDraft(key); setPendingDraft(null); };

  // What Save would write right now — the History drawer diffs versions
  // against this, so the author sees exactly what Restore would change.
  const serialise = (d: Record<string, any>, b: string) =>
    isFileCollection ? JSON.stringify(d, null, 2) + '\n' : stringify({ data: cleanForSchema(d), body: b });

  // Restore = load an old version into the form as an unsaved edit. Nothing is
  // published until Save, which still carries the live sha (conflict-safe).
  const restoreVersion = (content: string, entry: HistoryEntry) => {
    try {
      if (isFileCollection) setData(JSON.parse(content));
      else { const doc = parse(content); setData(doc.data); setBody(doc.body); }
      setDirty(true); setFieldErrors({}); setError(''); setShowHistory(false);
      setNotice(`Restored the version from ${timeAgo(entry.date) || entry.sha.slice(0, 7)}. Review it, then Save & publish to make it live.`);
    } catch (e: any) {
      setShowHistory(false);
      setError(e?.message || 'That version could not be read.');
    }
  };

  const save = async () => {
    setSaving(true); setError(''); setNotice(''); setFieldErrors({});
    try {
      if (isFileCollection) {
        await writeFile(collection.file!, JSON.stringify(data, null, 2) + '\n', `studio: update ${collection.label}`, sha);
        if (collection.file === AI_GUIDE_PATH) invalidateAiGuide();
      } else {
        // Validate against the same Zod schema the build uses — a bad entry
        // never reaches the repo, and each problem lands on its field.
        const clean = cleanForSchema(data);
        const errs = validateEntry(collection.id, clean);
        if (Object.keys(errs).length) {
          setFieldErrors(errs);
          const first = collection.fields.find((f) => errs[f.name]);
          setError(`Fix ${Object.keys(errs).length === 1 ? 'the highlighted field' : `${Object.keys(errs).length} highlighted fields`} before publishing.`);
          requestAnimationFrame(() => document.getElementById(`f-${first?.name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          return;
        }
        let p = filePath;
        if (!p) {
          const label = String(data[collection.labelField] || 'untitled');
          p = await uniqueEntryPath(collection.dir!, slugify(label));
          setFilePath(p);
        }
        const content = stringify({ data: clean, body });
        const res = await writeFile(p, content, `studio: ${path ? 'update' : 'create'} ${data[collection.labelField] || ''}`, sha);
        setSha(res.sha ?? null);
      }
      setDirty(false);
      clearDraft(key);
      onPublished?.();
      onDone();
    } catch (e: any) {
      if (isSessionExpired(e)) setError('Your session expired. Sign in again (your edits are kept here), then Save.');
      else if (isConflict(e)) setError('Someone (or another tab) changed this entry since you opened it. Copy your changes, reload the entry, and re-apply them.');
      else setError(e.message || 'Save failed.');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!filePath || !sha) return;
    if (!confirm('Delete this entry? This commits a deletion to your repo.')) return;
    setSaving(true);
    try { await deleteFile(filePath, `studio: delete ${data[collection.labelField] || ''}`, sha); clearDraft(key); onPublished?.(); onDone(); }
    catch (e: any) { setError(e.message); setSaving(false); }
  };

  if (loading) return <div className="st-loading">Loading…</div>;

  const title = isFileCollection
    ? collection.label
    : (data[collection.labelField] || (path ? collection.label : `New ${collection.label.replace(/s$/, '')}`));
  const errorCount = Object.keys(fieldErrors).length;

  return (
    <div className={`st-editor${showPreview ? ' st-editor--split' : ''}`}>
      <div className="st-editor__bar">
        <button className="st-btn st-btn--ghost" onClick={guardedDone}>← Back</button>
        <div className="st-editor__bar-right">
          {dirty && <span className="st-editor__dirty u-mono" title="Unsaved changes (kept locally until you publish)">● unsaved</span>}
          {hasBody && (
            <button type="button" role="switch" aria-checked={preview}
              className={`st-btn st-btn--toggle${preview ? ' is-on' : ''}`} onClick={togglePreview}>
              {preview ? '◉' : '○'} Preview
            </button>
          )}
          {repoPath && sha && (
            <button type="button" className="st-btn st-btn--ghost" onClick={() => setShowHistory(true)} title="Every published version of this entry">History</button>
          )}
          {filePath && !isFileCollection && sha && (
            <button className="st-btn st-btn--danger" onClick={remove} disabled={saving}>Delete</button>
          )}
          <button className="st-btn st-btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Publishing…' : 'Save & publish'}
          </button>
        </div>
      </div>

      <h1 className="st-page-title">{title}</h1>

      {pendingDraft && (
        <div className="st-draft" role="status">
          <div>
            <strong>Unsaved draft found</strong>
            <span className="st-draft__sub">From {new Date(pendingDraft.at).toLocaleString()} — newer than what's published.</span>
          </div>
          <div className="st-draft__actions">
            <button className="st-btn st-btn--primary" onClick={restoreDraft}>Restore draft</button>
            <button className="st-btn st-btn--ghost" onClick={discardDraft}>Discard</button>
          </div>
        </div>
      )}

      {error && <div className="st-error" role="alert">{error}{errorCount > 1 && <span className="st-error__count"> · {errorCount} issues</span>}</div>}
      {notice && (
        <div className="st-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="st-btn st-btn--ghost" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="st-editor__cols">
        <div className="st-editor__form">
          {collection.fields.map((f) => (
            <Field key={f.name} field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} error={fieldErrors[f.name]} />
          ))}

          {hasBody && (
            <div className="sf">
              <label className="sf__label">{collection.bodyLabel}</label>
              <MarkdownEditor value={body} onChange={setBodyDirty} mediaDir={collection.mediaDir} />
              <p className="sf__hint">Use the toolbar or type markdown. Headings (##) build the table of contents; drag an image into the box to insert it.</p>
            </div>
          )}
        </div>

        {showPreview && (
          <PreviewPane
            body={body}
            title={data[collection.labelField]}
            cover={data.coverImage}
            coverDir={collection.mediaDir}
          />
        )}
      </div>

      {showHistory && repoPath && (
        <History path={repoPath} current={serialise(data, body)} onRestore={restoreVersion} onClose={() => setShowHistory(false)} />
      )}

      <div className="st-editor__footer">
        <button className="st-btn st-btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Publishing…' : 'Save & publish'}
        </button>
        <span className="st-editor__note">Saving commits to GitHub and rebuilds the site (~90s to live).</span>
      </div>
    </div>
  );
};
