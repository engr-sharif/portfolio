import { useEffect, useState, type FC } from 'react';
import type { Collection } from './schema';
import { Field } from './Field';
import { MarkdownEditor } from './MarkdownEditor';
import { readFile, writeFile, deleteFile } from './api';
import { parse, stringify } from './frontmatter';

interface Props {
  collection: Collection;
  path: string | null;       // existing entry path, or null for "new"
  onDone: () => void;        // back to list
  onPublished?: () => void;  // fired after a successful save (for the toast)
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const Editor: FC<Props> = ({ collection, path, onDone, onPublished }) => {
  const [data, setData] = useState<Record<string, any>>({});
  const [body, setBody] = useState('');
  const [sha, setSha] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(path);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false); // unsaved-changes guard

  const isFileCollection = collection.kind === 'file';

  // Warn on browser/tab close if there are unsaved edits.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const guardedDone = () => {
    if (dirty && !confirm('You have unsaved changes. Discard them and leave?')) return;
    onDone();
  };

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        if (isFileCollection) {
          const f = await readFile(collection.file!);
          setData(f.content ? JSON.parse(f.content) : {});
          setSha(f.sha);
        } else if (path) {
          const f = await readFile(path);
          const doc = parse(f.content || '');
          setData(doc.data); setBody(doc.body); setSha(f.sha);
        } else {
          // new entry: seed defaults
          const seed: Record<string, any> = {};
          for (const fl of collection.fields) if (fl.default !== undefined) seed[fl.name] = fl.default;
          setData(seed); setBody(''); setSha(null);
        }
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [collection.id, path]);

  const set = (name: string, v: any) => { setData((d) => ({ ...d, [name]: v })); setDirty(true); };
  const setBodyDirty = (v: string) => { setBody(v); setDirty(true); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      if (isFileCollection) {
        await writeFile(collection.file!, JSON.stringify(data, null, 2) + '\n', `studio: update ${collection.label}`, sha);
      } else {
        let p = filePath;
        if (!p) {
          const label = data[collection.labelField] || 'untitled';
          p = `${collection.dir}/${slugify(String(label))}.md`;
          setFilePath(p);
        }
        const content = stringify({ data, body });
        const res = await writeFile(p, content, `studio: ${path ? 'update' : 'create'} ${data[collection.labelField] || ''}`, sha);
        setSha(res.sha ?? null);
      }
      setDirty(false);
      onPublished?.();
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!filePath || !sha) return;
    if (!confirm('Delete this entry? This commits a deletion to your repo.')) return;
    setSaving(true);
    try { await deleteFile(filePath, `studio: delete ${data[collection.labelField] || ''}`, sha); onDone(); }
    catch (e: any) { setError(e.message); setSaving(false); }
  };

  if (loading) return <div className="st-loading">Loading…</div>;

  return (
    <div className="st-editor">
      <div className="st-editor__bar">
        <button className="st-btn st-btn--ghost" onClick={guardedDone}>← Back</button>
        <div className="st-editor__bar-right">
          {filePath && !isFileCollection && (
            <button className="st-btn st-btn--danger" onClick={remove} disabled={saving}>Delete</button>
          )}
          <button className="st-btn st-btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Publishing…' : 'Save & publish'}
          </button>
        </div>
      </div>

      <h1 className="st-page-title">
        {isFileCollection
          ? collection.label
          : (data[collection.labelField] || (path ? collection.label : `New ${collection.label.replace(/s$/, '')}`))}
      </h1>

      {error && <div className="st-error">{error}</div>}

      <div className="st-editor__form">
        {collection.fields.map((f) => (
          <Field key={f.name} field={f} value={data[f.name]} onChange={(v) => set(f.name, v)} />
        ))}

        {!isFileCollection && collection.bodyLabel && (
          <div className="sf">
            <label className="sf__label">{collection.bodyLabel}</label>
            <MarkdownEditor value={body} onChange={setBodyDirty} mediaDir={collection.mediaDir} />
            <p className="sf__hint">Use the toolbar or type markdown. Headings (##) build the table of contents; drag an image into the box to insert it.</p>
          </div>
        )}
      </div>

      <div className="st-editor__footer">
        <button className="st-btn st-btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Publishing…' : 'Save & publish'}
        </button>
        <span className="st-editor__note">Saving commits to GitHub and rebuilds the site (~90s to live).</span>
      </div>
    </div>
  );
};
