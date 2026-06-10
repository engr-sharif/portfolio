import { useState, useEffect, useRef, type FC } from 'react';
import type { Field as FieldDef } from './schema';
import { uploadImage, rawImageUrl, rawRepoUrl } from './api';
import { listImages, type MediaItem } from './studio-lib';
import { processImage, type ImageMeta } from './image-process';

interface Props {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
  onMeta?: (m: ImageMeta) => void;   // image fields: surface extracted EXIF (GPS/date)
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');

/** Optimise + upload an image to the repo; returns the stored path and any
 * EXIF metadata (GPS/date) read before re-encoding stripped it. */
async function uploadFile(file: File, dir: string): Promise<{ path: string; meta: ImageMeta }> {
  const { file: out, meta } = await processImage(file);
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(out);
  });
  const name = slugify(out.name);
  const path = `${dir}/${name}`;
  await uploadImage(path, base64, `studio: upload ${name}`);
  return { path: `/${path}`, meta }; // stored as /src/assets/... — the basename resolver handles it
}

/** Upload a non-image asset (PDF, share image) into /public and return the
 * SERVED path (e.g. public/resume/cv.pdf → /resume/cv.pdf). Images are
 * optimised; PDFs pass through untouched. */
async function uploadPublicFile(file: File, dir: string): Promise<string> {
  const { file: out } = await processImage(file);
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(out);
  });
  const name = slugify(out.name);
  const path = `${dir}/${name}`;
  await uploadImage(path, base64, `studio: upload ${name}`);
  return '/' + path.replace(/^public\//, ''); // public/og/x.png → /og/x.png
}

export const Field: FC<Props> = ({ field, value, onChange, onMeta }) => {
  const id = `f-${field.name}`;
  const label = (
    <label className="sf__label" htmlFor={id}>
      {field.label}
      {field.required && <span className="sf__req">*</span>}
    </label>
  );

  switch (field.type) {
    case 'text':
      return (
        <div className="sf">
          {label}
          <input id={id} className="sf__input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
          {field.hint && <p className="sf__hint">{field.hint}</p>}
        </div>
      );

    case 'textarea':
    case 'markdown':
      return (
        <div className="sf">
          {label}
          <textarea
            id={id}
            className="sf__input sf__textarea"
            rows={field.type === 'markdown' ? 14 : 4}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.hint && <p className="sf__hint">{field.hint}</p>}
        </div>
      );

    case 'number':
      return (
        <div className="sf">
          {label}
          <input id={id} type="number" className="sf__input sf__input--sm" value={value ?? 0}
            onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
        </div>
      );

    case 'boolean':
      return (
        <div className="sf sf--row">
          <button type="button" role="switch" aria-checked={!!value}
            className={`sf__toggle${value ? ' is-on' : ''}`} onClick={() => onChange(!value)}>
            <span className="sf__toggle-knob" />
          </button>
          <div>
            <span className="sf__label sf__label--inline">{field.label}</span>
            {field.hint && <p className="sf__hint">{field.hint}</p>}
          </div>
        </div>
      );

    case 'select':
      return (
        <div className="sf">
          {label}
          <div className="sf__chips">
            {field.options?.map((opt) => (
              <button type="button" key={opt}
                className={`sf__chip${value === opt ? ' is-active' : ''}`}
                onClick={() => onChange(opt)}>{opt}</button>
            ))}
          </div>
        </div>
      );

    case 'date':
      return (
        <div className="sf">
          {label}
          <input id={id} type="date" className="sf__input sf__input--sm"
            value={(value ?? '').slice(0, 10)} onChange={(e) => onChange(e.target.value)} />
        </div>
      );

    case 'tags':
      return <TagsField field={field} value={value} onChange={onChange} label={label} />;

    case 'image':
      return <ImageField field={field} value={value} onChange={onChange} onMeta={onMeta} label={label} />;

    case 'file':
      return <FileField field={field} value={value} onChange={onChange} label={label} />;

    case 'list':
      return <ListField field={field} value={value} onChange={onChange} />;

    default:
      return null;
  }
};

/* -------------------------------------------------------------- Tags / list */
const TagsField: FC<Props & { label: React.ReactNode }> = ({ field, value, onChange, label }) => {
  const [draft, setDraft] = useState('');
  const [lib, setLib] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const arr: string[] = Array.isArray(value) ? value : [];
  const isImage = field.itemType === 'image';
  const dir = field.mediaDir || 'src/assets/gallery';

  const add = (v: string) => { if (v.trim()) onChange([...arr, v.trim()]); setDraft(''); };
  const remove = (i: number) => onChange(arr.filter((_, j) => j !== i));
  const move = (i: number, d: number) => {
    const n = [...arr]; const t = i + d;
    if (t < 0 || t >= n.length) return;
    [n[i], n[t]] = [n[t], n[i]]; onChange(n);
  };

  // Upload several images one at a time, committing each as it lands so they
  // appear progressively and one failure can't lose the whole batch.
  const uploadMany = async (files: File[]) => {
    setBusy(true); setErr('');
    let acc = [...arr];
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const { path } = await uploadFile(files[i], dir);
        acc = [...acc, path];
        onChange(acc);
      } catch (e: any) {
        failed.push(files[i].name);
      }
    }
    setProgress('');
    setBusy(false);
    if (failed.length) {
      setErr(`Couldn't upload ${failed.length} file(s): ${failed.join(', ')}. ` +
        `Try again, or add them one at a time — a flaky connection is the usual cause.`);
    }
  };

  return (
    <div className="sf">
      {label}
      {isImage ? (
        <div className="sf__imggrid">
          {arr.map((t, i) => (
            <div className="sf__imggrid-item" key={i}>
              <img src={rawImageUrl(t, dir)} alt="" loading="lazy" />
              <div className="sf__imggrid-actions">
                <button type="button" onClick={() => move(i, -1)} aria-label="Move earlier">←</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Move later">→</button>
                <button type="button" onClick={() => remove(i)} aria-label="Remove">×</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sf__tags">
          {arr.map((t, i) => (
            <span className="sf__tag" key={i}>{t}<button type="button" onClick={() => remove(i)} aria-label="Remove">×</button></span>
          ))}
        </div>
      )}
      {isImage ? (
        <>
          <div className="sf__image-actions">
            <label className={`sf__btn sf__btn--upload${busy ? ' is-busy' : ''}`}>
              {busy ? (progress || 'Uploading…') : '+ Upload'}
              <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = ''; // allow re-selecting the same files later
                if (files.length) await uploadMany(files);
              }} />
            </label>
            <button type="button" className="sf__btn sf__btn--ghost" disabled={busy} onClick={() => setLib(true)}>Choose existing</button>
          </div>
          {err && <p className="sf__hint sf__hint--err">{err}</p>}
        </>
      ) : (
        <input className="sf__input sf__input--sm" placeholder="Type and press Enter" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }} />
      )}
      {field.hint && <p className="sf__hint">{field.hint}</p>}
      {lib && <MediaLibrary dir={dir} onPick={(p) => { onChange([...arr, p]); setLib(false); }} onClose={() => setLib(false)} />}
    </div>
  );
};

const ImageField: FC<Props & { label: React.ReactNode }> = ({ field, value, onChange, onMeta, label }) => {
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);
  const dir = field.mediaDir || 'src/assets/covers';
  return (
    <div className="sf">
      {label}
      <div className="sf__image">
        {value ? (
          <span className="sf__thumb"><img src={rawImageUrl(String(value), dir)} alt="" loading="lazy" /></span>
        ) : (
          <span className="sf__thumb sf__thumb--empty">No image</span>
        )}
        <div className="sf__image-actions">
          <label className="sf__btn sf__btn--upload">
            {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              setBusy(true);
              try { const { path, meta } = await uploadFile(f, dir); onChange(path); onMeta?.(meta); }
              finally { setBusy(false); }
            }} />
          </label>
          <button type="button" className="sf__btn sf__btn--ghost" onClick={() => setLib(true)}>Choose existing</button>
          {value && <button type="button" className="sf__btn sf__btn--ghost" onClick={() => onChange('')}>Clear</button>}
        </div>
      </div>
      {field.hint && <p className="sf__hint">{field.hint}</p>}
      {lib && <MediaLibrary dir={dir} onPick={(p) => { onChange(p); setLib(false); }} onClose={() => setLib(false)} />}
    </div>
  );
};

const isImagePath = (s: string) => /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(s);

const FileField: FC<Props & { label: React.ReactNode }> = ({ field, value, onChange, label }) => {
  const [busy, setBusy] = useState(false);
  const dir = field.mediaDir || 'public/uploads';
  const val = String(value || '');
  return (
    <div className="sf">
      {label}
      <div className="sf__file">
        {val ? (
          isImagePath(val)
            ? <span className="sf__thumb"><img src={rawRepoUrl(`public${val}`)} alt="" loading="lazy" /></span>
            : <span className="sf__file-name">{val.split('/').pop()}</span>
        ) : (
          <span className="sf__file-name sf__file-name--empty">No file</span>
        )}
        <div className="sf__image-actions">
          <label className="sf__btn sf__btn--upload">
            {busy ? 'Uploading…' : val ? 'Replace' : 'Upload'}
            <input type="file" accept={field.accept || undefined} hidden disabled={busy} onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              setBusy(true);
              try { onChange(await uploadPublicFile(f, dir)); } finally { setBusy(false); }
            }} />
          </label>
          {val && <button type="button" className="sf__btn sf__btn--ghost" onClick={() => onChange('')}>Clear</button>}
        </div>
      </div>
      {field.hint && <p className="sf__hint">{field.hint}</p>}
    </div>
  );
};

/* ----------------------------------------------------------- Media library */
const MediaLibrary: FC<{ dir: string; onPick: (path: string) => void; onClose: () => void }> = ({ dir, onPick, onClose }) => {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  useEffect(() => { listImages(dir).then(setItems); }, [dir]);
  return (
    <div className="st-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="st-modal__panel">
        <div className="st-modal__head">
          <h3>Media library <span className="st-modal__dir">{dir}</span></h3>
          <button className="sf__btn sf__btn--ghost" onClick={onClose}>Close</button>
        </div>
        {items === null ? <div className="st-loading">Loading…</div> : items.length === 0 ? (
          <p className="st-list__empty">No images here yet — upload one.</p>
        ) : (
          <div className="st-media">
            {items.map((m) => (
              <button type="button" key={m.path} className="st-media__item" onClick={() => onPick(m.path)} title={m.name}>
                <img src={m.url} alt="" loading="lazy" />
                <span className="st-media__name">{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ListField: FC<Props> = ({ field, value, onChange }) => {
  const arr: any[] = Array.isArray(value) ? value : [];
  const update = (i: number, patch: any) => onChange(arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(arr.filter((_, j) => j !== i));
  const move = (i: number, d: number) => {
    const n = [...arr]; const t = i + d;
    if (t < 0 || t >= n.length) return;
    [n[i], n[t]] = [n[t], n[i]]; onChange(n);
  };
  const blank = () => Object.fromEntries((field.fields || []).map((f) => [f.name, '']));
  // Geo-aware lists (those with a lat field, e.g. the Field Gallery) auto-fill
  // an item's coordinates + date from the photo's EXIF on upload.
  const geoAware = (field.fields || []).some((f) => f.name === 'lat');
  const applyMeta = (i: number, m: ImageMeta) => {
    const patch: Record<string, any> = {};
    if (m.lat != null) { patch.lat = m.lat; patch.lng = m.lng; }
    if (m.takenAt) patch.takenAt = m.takenAt;
    if (Object.keys(patch).length) update(i, patch);
  };

  return (
    <div className="sf">
      <span className="sf__label">{field.label}</span>
      <div className="sf__list">
        {arr.map((item, i) => (
          <div className="sf__listitem" key={i}>
            <div className="sf__listitem-head">
              <span className="sf__listitem-n">{String(i + 1).padStart(2, '0')}</span>
              <div className="sf__listitem-actions">
                <button type="button" onClick={() => move(i, -1)} aria-label="Up">↑</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Down">↓</button>
                <button type="button" onClick={() => remove(i)} aria-label="Remove">×</button>
              </div>
            </div>
            {(field.fields || []).map((sf) => (
              <Field key={sf.name} field={sf} value={item[sf.name]} onChange={(v) => update(i, { [sf.name]: v })}
                onMeta={geoAware && sf.type === 'image' ? (m) => applyMeta(i, m) : undefined} />
            ))}
          </div>
        ))}
      </div>
      <button type="button" className="sf__btn" onClick={() => onChange([...arr, blank()])}>+ Add {field.label.replace(/s$/, '')}</button>
    </div>
  );
};
