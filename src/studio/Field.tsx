import { useState, type FC } from 'react';
import type { Field as FieldDef } from './schema';
import { uploadImage } from './api';

interface Props {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');

/** Upload an image file to the repo via the Worker; returns the stored path. */
async function uploadFile(file: File, dir: string): Promise<string> {
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const name = slugify(file.name);
  const path = `${dir}/${name}`;
  await uploadImage(path, base64, `studio: upload ${name}`);
  return `/${path}`; // stored as /src/assets/... — the basename resolver handles it
}

export const Field: FC<Props> = ({ field, value, onChange }) => {
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
      return <ImageField field={field} value={value} onChange={onChange} label={label} />;

    case 'list':
      return <ListField field={field} value={value} onChange={onChange} />;

    default:
      return null;
  }
};

/* -------------------------------------------------------------- Tags / list */
const TagsField: FC<Props & { label: React.ReactNode }> = ({ field, value, onChange, label }) => {
  const [draft, setDraft] = useState('');
  const arr: string[] = Array.isArray(value) ? value : [];
  const isImage = field.itemType === 'image';

  const add = (v: string) => { if (v.trim()) onChange([...arr, v.trim()]); setDraft(''); };
  const remove = (i: number) => onChange(arr.filter((_, j) => j !== i));

  return (
    <div className="sf">
      {label}
      <div className="sf__tags">
        {arr.map((t, i) => (
          <span className="sf__tag" key={i}>
            {isImage ? t.split('/').pop() : t}
            <button type="button" onClick={() => remove(i)} aria-label="Remove">×</button>
          </span>
        ))}
      </div>
      {isImage ? (
        <label className="sf__btn sf__btn--upload">
          + Add image
          <input type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (f) onChange([...arr, await uploadFile(f, field.mediaDir || 'src/assets/gallery')]);
          }} />
        </label>
      ) : (
        <input className="sf__input sf__input--sm" placeholder="Type and press Enter" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }} />
      )}
      {field.hint && <p className="sf__hint">{field.hint}</p>}
    </div>
  );
};

const ImageField: FC<Props & { label: React.ReactNode }> = ({ field, value, onChange, label }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="sf">
      {label}
      <div className="sf__image">
        {value ? <span className="sf__image-name">{String(value).split('/').pop()}</span> : <span className="sf__image-empty">No image</span>}
        <label className="sf__btn sf__btn--upload">
          {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setBusy(true);
            try { onChange(await uploadFile(f, field.mediaDir || 'src/assets/covers')); } finally { setBusy(false); }
          }} />
        </label>
        {value && <button type="button" className="sf__btn sf__btn--ghost" onClick={() => onChange('')}>Clear</button>}
      </div>
      {field.hint && <p className="sf__hint">{field.hint}</p>}
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
              <Field key={sf.name} field={sf} value={item[sf.name]} onChange={(v) => update(i, { [sf.name]: v })} />
            ))}
          </div>
        ))}
      </div>
      <button type="button" className="sf__btn" onClick={() => onChange([...arr, blank()])}>+ Add {field.label.replace(/s$/, '')}</button>
    </div>
  );
};
