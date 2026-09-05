import { useEffect, useState, type FC, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImagePlus, Images, Sparkles, Trash2, Upload, X, Plus } from 'lucide-react';
import type { Field as FieldDef } from '../../schema';
import { uploadImage, rawImageUrl, rawRepoUrl, aiAssist } from '../../api';
import { aiGuide } from '../../studio-lib';
import { useMedia } from '../../app/queries';
import { processImage, type ImageMeta } from '../../image-process';
import { Button, Dialog, IconButton, Input, Switch, Textarea } from '../../ui/primitives';

/**
 * Schema-driven form fields. Every field type the collections use, with:
 * drag-to-reorder for image lists and object lists (dnd-kit, keyboard too),
 * drop-to-upload on image fields, an in-place media library, and AI alt text.
 */
export interface FieldProps {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
  error?: string;
  onMeta?: (m: ImageMeta) => void;
  onCaption?: (text: string) => void;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');
const readAsDataUrl = (file: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(file); });

async function uploadFile(file: File, dir: string): Promise<{ path: string; meta: ImageMeta }> {
  const { file: out, meta } = await processImage(file);
  const name = slugify(out.name);
  const path = `${dir}/${name}`;
  await uploadImage(path, await readAsDataUrl(out), `studio: upload ${name}`);
  return { path: `/${path}`, meta };
}
async function uploadPublicFile(file: File, dir: string): Promise<string> {
  const { file: out } = await processImage(file);
  const name = slugify(out.name);
  const path = `${dir}/${name}`;
  await uploadImage(path, await readAsDataUrl(out), `studio: upload ${name}`);
  return '/' + path.replace(/^public\//, '');
}
const isImagePath = (s: string) => /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(s);
const acceptFiles = (dt: DataTransfer | null) => Array.from(dt?.files || []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));

const Label: FC<{ field: FieldDef; htmlFor?: string; as?: 'label' | 'span' }> = ({ field, htmlFor, as = 'label' }) => {
  const inner = <>{field.label}{field.required && <span className="sf__req" aria-hidden> *</span>}</>;
  return as === 'label' ? <label className="sf__label" htmlFor={htmlFor}>{inner}</label> : <span className="sf__label">{inner}</span>;
};
const Hint: FC<{ field: FieldDef }> = ({ field }) => (field.hint ? <p className="sf__hint">{field.hint}</p> : null);
const ErrorLine: FC<{ id: string; msg?: string }> = ({ id, msg }) => (msg ? <p id={id} className="sf__err" role="alert">{msg}</p> : null);
const Wrap: FC<{ error?: string; row?: boolean; children: ReactNode }> = ({ error, row, children }) => <div className={`sf${row ? ' sf--row' : ''}${error ? ' sf--invalid' : ''}`}>{children}</div>;

export const Field: FC<FieldProps> = (props) => {
  const { field, value, onChange, error } = props;
  const id = `f-${field.name}`;
  const errId = `${id}-err`;
  const a11y = error ? { 'aria-describedby': errId } : {};

  switch (field.type) {
    case 'text':
      return <Wrap error={error}><Label field={field} htmlFor={id} /><Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={!!error} {...a11y} /><ErrorLine id={errId} msg={error} /><Hint field={field} /></Wrap>;
    case 'textarea':
    case 'markdown':
      return <Wrap error={error}><Label field={field} htmlFor={id} /><Textarea id={id} rows={field.type === 'markdown' ? 14 : 4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={!!error} {...a11y} /><ErrorLine id={errId} msg={error} /><Hint field={field} /></Wrap>;
    case 'number':
      return <NumberField {...props} />;
    case 'boolean':
      return (
        <Wrap row>
          <Switch id={id} checked={!!value} onChange={(v) => onChange(v)} label={field.label} />
          <div><label className="sf__label sf__label--inline" htmlFor={id}>{field.label}</label><Hint field={field} /></div>
        </Wrap>
      );
    case 'select': {
      const opts = field.options ?? [];
      const legacy = value != null && value !== '' && !opts.includes(value);
      return (
        <Wrap error={error}>
          <Label field={field} as="span" />
          <div className="sf__chips" role="radiogroup" aria-label={field.label}>
            {opts.map((opt) => <button type="button" key={opt} role="radio" aria-checked={value === opt} className={`chip${value === opt ? ' is-on' : ''}`} onClick={() => onChange(opt)}>{opt}</button>)}
            {legacy && <button type="button" role="radio" aria-checked className="chip is-on chip--legacy" title="Not one of the current options. Pick another to replace it.">{String(value)} · legacy</button>}
            {value && !field.required && <button type="button" className="chip chip--clear" onClick={() => onChange(undefined)}>clear</button>}
          </div>
          <ErrorLine id={errId} msg={error} /><Hint field={field} />
        </Wrap>
      );
    }
    case 'date':
      return <Wrap error={error}><Label field={field} htmlFor={id} /><Input id={id} type="date" className="inp--sm" value={String(value ?? '').slice(0, 10)} onChange={(e) => onChange(e.target.value)} invalid={!!error} {...a11y} /><ErrorLine id={errId} msg={error} /><Hint field={field} /></Wrap>;
    case 'tags':
      return field.itemType === 'image' ? <ImageListField {...props} /> : <TagsField {...props} />;
    case 'image':
      return <ImageField {...props} />;
    case 'file':
      return <FileField {...props} />;
    case 'list':
      return <ListField {...props} />;
    default:
      return null;
  }
};

/* ------------------------------------------------------------------ Number */
const NumberField: FC<FieldProps> = ({ field, value, onChange, error }) => {
  const id = `f-${field.name}`;
  const [text, setText] = useState(value == null || value === '' ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : Number(text);
    const same = (parsed === undefined && (value == null || value === '')) || (typeof value === 'number' && parsed === value);
    if (!same) setText(value == null || value === '' ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (t: string) => {
    setText(t);
    const s = t.trim();
    if (s === '') { onChange(undefined); return; }
    if (/^-?\d*\.?\d*$/.test(s) && !['-', '.', '-.'].includes(s)) { const n = Number(s); if (Number.isFinite(n)) onChange(n); }
  };
  const bad = text.trim() !== '' && !Number.isFinite(Number(text));
  return (
    <Wrap error={error || (bad ? 'x' : undefined)}>
      <Label field={field} htmlFor={id} />
      <Input id={id} inputMode="decimal" className="inp--sm" value={text} onChange={(e) => commit(e.target.value)} onBlur={() => { if (bad) setText(value == null ? '' : String(value)); }} invalid={!!(error || bad)} />
      <ErrorLine id={`${id}-err`} msg={error || (bad ? 'Enter a number' : undefined)} /><Hint field={field} />
    </Wrap>
  );
};

/* -------------------------------------------------------------------- Tags */
const TagsField: FC<FieldProps> = ({ field, value, onChange, error }) => {
  const [draft, setDraft] = useState('');
  const arr: string[] = Array.isArray(value) ? value : [];
  const add = (v: string) => { const t = v.trim(); if (t && !arr.includes(t)) onChange([...arr, t]); setDraft(''); };
  const remove = (i: number) => onChange(arr.filter((_, j) => j !== i));
  return (
    <Wrap error={error}>
      <Label field={field} htmlFor={`f-${field.name}`} />
      <div className="tags" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
        {arr.map((t, i) => <span className="tag" key={`${t}-${i}`}>{t}<button type="button" onClick={() => remove(i)} aria-label={`Remove ${t}`}><X size={12} /></button></span>)}
        <input id={`f-${field.name}`} className="tags__input" placeholder={arr.length ? '' : 'Type, then Enter'} value={draft} aria-label={`Add ${field.label}`}
          onChange={(e) => { const v = e.target.value; if (v.includes(',')) { v.split(',').forEach(add); return; } setDraft(v); }}
          onBlur={() => add(draft)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } else if (e.key === 'Backspace' && !draft && arr.length) { e.preventDefault(); remove(arr.length - 1); } }} />
      </div>
      <ErrorLine id={`f-${field.name}-err`} msg={error} /><Hint field={field} />
    </Wrap>
  );
};

/* --------------------------------------------------------- Image list (dnd) */
const useDndSensors = () => useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

const ImageListField: FC<FieldProps> = ({ field, value, onChange, error }) => {
  const arr: string[] = Array.isArray(value) ? value : [];
  const dir = field.mediaDir || 'src/assets/gallery';
  const [lib, setLib] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const sensors = useDndSensors();
  const ids = arr.map((p, i) => `${p}#${i}`);

  const uploadMany = async (files: File[]) => {
    if (!files.length) return;
    setErr(''); let acc = [...arr]; const failed: string[] = []; let last = '';
    for (let i = 0; i < files.length; i++) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try { const { path } = await uploadFile(files[i], dir); acc = [...acc, path]; onChange(acc); }
      catch (e: any) { failed.push(files[i].name); last = e?.message || ''; }
    }
    setBusy('');
    if (failed.length) setErr(`Couldn't upload ${failed.join(', ')}. ${last}`);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over: o } = e; if (!o || active.id === o.id) return;
    onChange(arrayMove(arr, ids.indexOf(String(active.id)), ids.indexOf(String(o.id))));
  };
  return (
    <Wrap error={error}>
      <Label field={field} as="span" />
      <div className={`dropzone${over ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); uploadMany(acceptFiles(e.dataTransfer)); }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="imggrid">
              {arr.map((p, i) => <SortableThumb key={ids[i]} id={ids[i]} src={rawImageUrl(p, dir)} label={p.split('/').pop() || p} onRemove={() => onChange(arr.filter((_, j) => j !== i))} />)}
              <label className={`imggrid__add${busy ? ' is-busy' : ''}`}>
                <input type="file" accept="image/*,.heic,.heif" multiple hidden disabled={!!busy} onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; uploadMany(fs); }} />
                <ImagePlus size={20} aria-hidden /><span>{busy || 'Add photos'}</span><small>or drop them here</small>
              </label>
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <div className="sf__row-actions"><Button size="sm" variant="ghost" icon={<Images size={14} />} onClick={() => setLib(true)}>Choose existing</Button>{arr.length > 1 && <span className="sf__hint">Drag to reorder · first is the lead image</span>}</div>
      {err && <p className="sf__err" role="alert">{err}</p>}
      <ErrorLine id={`f-${field.name}-err`} msg={error} /><Hint field={field} />
      <MediaLibrary open={lib} dir={dir} onPick={(p) => { onChange([...arr, p]); setLib(false); }} onClose={() => setLib(false)} />
    </Wrap>
  );
};

const SortableThumb: FC<{ id: string; src: string; label: string; onRemove: () => void }> = ({ id, src, label, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <figure ref={setNodeRef} className={`imggrid__item${isDragging ? ' is-dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} title={label}>
      <img src={src} alt="" loading="lazy" draggable={false} />
      <button type="button" className="imggrid__x" onClick={(e) => { e.stopPropagation(); onRemove(); }} onPointerDown={(e) => e.stopPropagation()} aria-label={`Remove ${label}`}><X size={12} /></button>
    </figure>
  );
};

/* ------------------------------------------------------------------- Image */
const ImageField: FC<FieldProps> = ({ field, value, onChange, error, onMeta, onCaption }) => {
  const dir = field.mediaDir || 'src/assets/covers';
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const up = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr('');
    try { const { path, meta } = await uploadFile(f, dir); onChange(path); onMeta?.(meta); }
    catch (e: any) { setErr(e?.message || 'Upload failed. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  const describe = async () => {
    if (!value) return;
    setDescribing(true); setErr(''); setDraft(null);
    try { const guide = await aiGuide(); const { result } = await aiAssist('alt', '', { image: rawImageUrl(String(value), dir), ...(guide ? { system: guide } : {}) }); result ? setDraft(result) : setErr('No description came back — try again.'); }
    catch (e: any) { setErr(e?.message || 'AI request failed.'); }
    finally { setDescribing(false); }
  };
  return (
    <Wrap error={error}>
      <Label field={field} as="span" />
      <div className={`imgfield${over ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); up(acceptFiles(e.dataTransfer)[0]); }}>
        <label className="imgfield__thumb" title="Click or drop an image">
          {value ? <img src={rawImageUrl(String(value), dir)} alt="" loading="lazy" /> : <span className="imgfield__empty"><Upload size={18} aria-hidden />{busy ? 'Uploading…' : 'Drop or click'}</span>}
          <input type="file" accept="image/*,.heic,.heif" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; up(f); }} />
        </label>
        <div className="imgfield__side">
          {value && <code className="imgfield__name">{String(value).split('/').pop()}</code>}
          <div className="sf__row-actions">
            <Button size="sm" variant="ghost" icon={<Images size={14} />} onClick={() => setLib(true)}>Choose existing</Button>
            {value && onCaption && <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} loading={describing} onClick={describe}>Describe</Button>}
            {value && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => onChange('')}>Clear</Button>}
          </div>
          {draft !== null && (
            <div className="ai-draft">
              <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="AI description" />
              <div className="sf__row-actions"><Button size="sm" variant="primary" onClick={() => { onCaption?.(draft); setDraft(null); }}>Use this</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button></div>
            </div>
          )}
        </div>
      </div>
      {err && <p className="sf__err" role="alert">{err}</p>}
      <ErrorLine id={`f-${field.name}-err`} msg={error} /><Hint field={field} />
      <MediaLibrary open={lib} dir={dir} onPick={(p) => { onChange(p); setLib(false); }} onClose={() => setLib(false)} />
    </Wrap>
  );
};

/* -------------------------------------------------------------------- File */
const FileField: FC<FieldProps> = ({ field, value, onChange, error }) => {
  const dir = field.mediaDir || 'public/uploads';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const val = String(value || '');
  return (
    <Wrap error={error}>
      <Label field={field} as="span" />
      <div className="imgfield">
        {val && isImagePath(val) ? <span className="imgfield__thumb imgfield__thumb--static"><img src={rawRepoUrl(`public${val}`)} alt="" loading="lazy" /></span> : null}
        <div className="imgfield__side">
          <code className={`imgfield__name${val ? '' : ' is-empty'}`}>{val ? val.split('/').pop() : 'No file'}</code>
          <div className="sf__row-actions">
            <label className="btn btn--secondary btn--sm"><Upload size={14} aria-hidden /><span className="btn__label">{busy ? 'Uploading…' : val ? 'Replace' : 'Upload'}</span>
              <input type="file" accept={field.accept || undefined} hidden disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); setErr(''); try { onChange(await uploadPublicFile(f, dir)); } catch (er: any) { setErr(er?.message || 'Upload failed.'); } finally { setBusy(false); } }} />
            </label>
            {val && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => onChange('')}>Clear</Button>}
          </div>
        </div>
      </div>
      {err && <p className="sf__err" role="alert">{err}</p>}
      <ErrorLine id={`f-${field.name}-err`} msg={error} /><Hint field={field} />
    </Wrap>
  );
};

/* ------------------------------------------------------------ Media library */
export const MediaLibrary: FC<{ open: boolean; dir: string; onPick: (path: string) => void; onClose: () => void }> = ({ open, dir, onPick, onClose }) => {
  const media = useMedia(dir);
  const [q, setQ] = useState('');
  const items = (media.data || []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onClose={onClose} title={<>Media library <code className="dlg__dir">{dir}</code></>} width={860}>
      <Input placeholder="Filter by file name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter media" autoFocus />
      {media.isLoading && <p className="sf__hint">Loading…</p>}
      {media.data && items.length === 0 && <p className="sf__hint">No images {q ? 'match' : 'here yet — upload one'}.</p>}
      <div className="media">
        {items.map((m) => <button type="button" key={m.path} className="media__item" onClick={() => onPick(m.path)} title={m.name}><img src={m.url} alt="" loading="lazy" /><span className="media__name">{m.name}</span></button>)}
      </div>
    </Dialog>
  );
};

/* ---------------------------------------------------------- List of objects */
const ListField: FC<FieldProps> = ({ field, value, onChange, error }) => {
  const arr: any[] = Array.isArray(value) ? value : [];
  const sensors = useDndSensors();
  const [ids, setIds] = useState<string[]>(() => arr.map(() => crypto.randomUUID()));
  useEffect(() => { if (ids.length !== arr.length) setIds((cur) => arr.map((_, i) => cur[i] || crypto.randomUUID())); }, [arr.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (i: number, patch: any) => onChange(arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => { onChange(arr.filter((_, j) => j !== i)); setIds((s) => s.filter((_, j) => j !== i)); };
  const blank = () => Object.fromEntries((field.fields || []).map((f) => [f.name, '']));
  const geoAware = (field.fields || []).some((f) => f.name === 'lat');
  const hasAlt = (field.fields || []).some((f) => f.name === 'alt');
  const applyMeta = (i: number, m: ImageMeta) => { const p: Record<string, any> = {}; if (m.lat != null) { p.lat = m.lat; p.lng = m.lng; } if (m.takenAt) p.takenAt = m.takenAt; if (Object.keys(p).length) update(i, p); };
  const applyCaption = (i: number, text: string) => { const p: Record<string, any> = { alt: text }; if (!arr[i]?.caption) p.caption = text; update(i, p); };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e; if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
    onChange(arrayMove(arr, from, to)); setIds(arrayMove(ids, from, to));
  };
  return (
    <Wrap error={error}>
      <Label field={field} as="span" />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="olist">
            {arr.map((item, i) => (
              <SortableItem key={ids[i]} id={ids[i]} index={i} onRemove={() => remove(i)}>
                {(field.fields || []).map((sf) => <Field key={sf.name} field={sf} value={item[sf.name]} onChange={(v) => update(i, { [sf.name]: v })} onMeta={geoAware && sf.type === 'image' ? (m) => applyMeta(i, m) : undefined} onCaption={hasAlt && sf.type === 'image' ? (t) => applyCaption(i, t) : undefined} />)}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <ErrorLine id={`f-${field.name}-err`} msg={error} />
      <div><Button size="sm" icon={<Plus size={14} />} onClick={() => { onChange([...arr, blank()]); setIds((s) => [...s, crypto.randomUUID()]); }}>Add {field.label.replace(/s$/, '').toLowerCase()}</Button></div>
    </Wrap>
  );
};

const SortableItem: FC<{ id: string; index: number; onRemove: () => void; children: ReactNode }> = ({ id, index, onRemove, children }) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} className={`olist__item${isDragging ? ' is-dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div className="olist__head">
        <button ref={setActivatorNodeRef} type="button" className="grip" aria-label={`Reorder item ${index + 1}`} {...attributes} {...listeners}><GripVertical size={16} /></button>
        <span className="olist__n">{String(index + 1).padStart(2, '0')}</span>
        <IconButton variant="ghost" size="sm" label="Remove item" icon={<Trash2 size={14} />} onClick={onRemove} />
      </div>
      <div className="olist__body">{children}</div>
    </div>
  );
};
