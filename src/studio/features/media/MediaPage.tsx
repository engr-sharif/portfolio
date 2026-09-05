import { useMemo, useRef, useState, type FC } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Trash2, Copy, Check, FileText, Film, Image as ImageIcon, Search, X, ExternalLink } from 'lucide-react';
import { MEDIA_DIRS, mediaDirById } from '../../media-dirs';
import { useDir, keys } from '../../app/queries';
import { commitFiles, uploadImage, rawRepoUrl, isMissingRoute, type ListEntry } from '../../api';
import { processImage } from '../../image-process';
import { useToast } from '../../ui/Toaster';
import { Button, Confirm, EmptyState, IconButton, Input, Skeleton } from '../../ui/primitives';

/**
 * Media library. One tab per managed folder; drop any number of files onto the
 * grid (or pick them) and they are optimised in the browser and committed
 * TOGETHER as one commit — so a batch can never half-land and the site
 * rebuilds once. Select items to delete them (one commit) or copy a path.
 */
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');
const isImg = (n: string) => /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(n);
const isVid = (n: string) => /\.(mp4|webm|mov)$/i.test(n);
const readB64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => rej(new Error('Could not read file.')); r.readAsDataURL(b); });
const fmt = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export const MediaPage: FC<{ dirId?: string }> = ({ dirId }) => {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast, publish } = useToast();
  const md = mediaDirById(dirId || '') || MEDIA_DIRS[0];
  const list = useDir(md.dir);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const files = useMemo(() => (list.data || []).filter((e) => e.type === 'file' && (!q || e.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name)), [list.data, q]);
  const invalidate = () => { qc.invalidateQueries({ queryKey: keys.dir(md.dir) }); qc.invalidateQueries({ queryKey: keys.media(md.dir) }); };

  const upload = async (incoming: FileList | File[] | null) => {
    const picked = Array.from(incoming || []);
    if (!picked.length) return;
    setBusy(`Preparing ${picked.length} file${picked.length === 1 ? '' : 's'}…`);
    try {
      const prepared: { path: string; content: string; encoding: 'base64'; bytes: number }[] = [];
      for (let i = 0; i < picked.length; i++) {
        const f = picked[i];
        setBusy(`Preparing ${i + 1} of ${picked.length}…`);
        const out = md.kind === 'image' || f.type.startsWith('image/') ? (await processImage(f)).file : f;
        prepared.push({ path: `${md.dir}/${slugify(out.name)}`, content: await readB64(out), encoding: 'base64', bytes: out.size });
      }
      setBusy(`Committing ${prepared.length} file${prepared.length === 1 ? '' : 's'}…`);
      let commit: string | undefined;
      try {
        commit = (await commitFiles(`studio: upload ${prepared.length} file${prepared.length === 1 ? '' : 's'} to ${md.dir}`, prepared.map(({ path, content, encoding }) => ({ path, content, encoding })))).commit;
      } catch (e) {
        if (!isMissingRoute(e)) throw e;
        for (const p of prepared) await uploadImage(p.path, `data:application/octet-stream;base64,${p.content}`, `studio: upload ${p.path.split('/').pop()}`);
      }
      invalidate();
      toast({ kind: 'success', title: `Uploaded ${prepared.length} file${prepared.length === 1 ? '' : 's'}`, description: `${fmt(prepared.reduce((n, p) => n + p.bytes, 0))} · one commit to ${md.dir}` });
      publish(commit);
    } catch (e: any) { toast({ kind: 'error', title: 'Upload failed', description: e?.message }); }
    finally { setBusy(''); if (input.current) input.current.value = ''; }
  };

  const del = async () => {
    const targets = files.filter((f) => selected.has(f.path));
    if (!targets.length) return;
    setBusy('Deleting…');
    try {
      const r = await commitFiles(`studio: delete ${targets.length} file${targets.length === 1 ? '' : 's'} from ${md.dir}`, [], targets.map((t) => ({ path: t.path, sha: t.sha })));
      invalidate(); setSelected(new Set()); setConfirmDel(false);
      toast({ kind: 'success', title: `Deleted ${targets.length} file${targets.length === 1 ? '' : 's'}`, description: 'One commit. Entries still referencing them will show a broken image until edited.' });
      publish(r.commit, 'Publishing deletion');
    } catch (e: any) { toast({ kind: 'error', title: 'Delete failed', description: e?.message }); }
    finally { setBusy(''); }
  };

  const copyPath = async (e: ListEntry) => {
    const stored = e.path.startsWith('public/') ? '/' + e.path.replace(/^public\//, '') : `/${e.path}`;
    try { await navigator.clipboard.writeText(stored); setCopied(e.path); setTimeout(() => setCopied(''), 1200); } catch { toast({ kind: 'info', title: stored, description: 'Copy this path manually.' }); }
  };
  const toggle = (p: string) => setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  return (
    <div className="page mediapg">
      <header className="page__head">
        <div><h1 className="page__title">Media</h1><p className="page__sub">{md.hint}</p></div>
        <div className="page__actions">
          <Button variant="primary" icon={<Upload size={15} />} onClick={() => input.current?.click()} loading={!!busy}>{busy || 'Upload'}</Button>
          <input ref={input} type="file" multiple hidden accept={md.kind === 'image' ? 'image/*,.heic,.heif' : md.kind === 'video' ? 'video/mp4,video/webm' : undefined} onChange={(e) => upload(e.target.files)} data-testid="media-input" />
        </div>
      </header>

      <div className="seg seg--wrap" role="tablist" aria-label="Folder">
        {MEDIA_DIRS.map((d) => <button key={d.id} type="button" role="tab" aria-selected={d.id === md.id} className={`seg__btn${d.id === md.id ? ' is-on' : ''}`} onClick={() => { setSelected(new Set()); navigate(`/media/${d.id}`); }}>{d.label}</button>)}
      </div>

      <div className="toolbar">
        <label className="toolbar__search"><Search size={15} aria-hidden /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by file name…" aria-label="Filter" />{q && <IconButton variant="ghost" size="sm" label="Clear" icon={<X size={13} />} onClick={() => setQ('')} />}</label>
        <span className="toolbar__note">{list.data ? `${files.length} file${files.length === 1 ? '' : 's'} · ${md.dir}` : ''}</span>
        {selected.size > 0 && (
          <div className="bulkbar bulkbar--inline">
            <span className="bulkbar__count">{selected.size} selected</span>
            <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmDel(true)}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      <div className={`mediagrid-wrap${over ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        {list.isLoading && <div className="mediagrid">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={120} radius={8} />)}</div>}
        {list.isError && <EmptyState title="Could not list this folder" hint={(list.error as Error)?.message} action={<Button onClick={() => list.refetch()}>Retry</Button>} />}
        {list.data && files.length === 0 && <EmptyState icon={<Upload size={28} />} title={q ? 'Nothing matches' : 'Nothing here yet'} hint={q ? 'Try another name.' : 'Drop files anywhere on this area, or use Upload. Several files become one commit.'} />}
        {files.length > 0 && (
          <div className="mediagrid" role="list">
            {files.map((f) => {
              const sel = selected.has(f.path);
              const url = rawRepoUrl(f.path);
              return (
                <div key={f.path} role="listitem" className={`mcard${sel ? ' is-selected' : ''}`} data-testid="media-item">
                  <button type="button" className="mcard__pick" onClick={() => toggle(f.path)} aria-pressed={sel} aria-label={`${sel ? 'Deselect' : 'Select'} ${f.name}`}>
                    {isImg(f.name) ? <img src={url} alt="" loading="lazy" /> : <span className="mcard__file">{isVid(f.name) ? <Film size={26} /> : <FileText size={26} />}</span>}
                    <span className={`mcard__check${sel ? ' is-on' : ''}`} aria-hidden><Check size={12} /></span>
                  </button>
                  <div className="mcard__meta">
                    <span className="mcard__name" title={f.name}>{f.name}</span>
                    <span className="mcard__actions">
                      <IconButton variant="ghost" size="sm" label={copied === f.path ? 'Copied' : 'Copy path'} icon={copied === f.path ? <Check size={13} /> : <Copy size={13} />} onClick={() => copyPath(f)} />
                      <a className="btn btn--ghost btn--sm btn--icon" href={url} target="_blank" rel="noreferrer" title="Open file" aria-label={`Open ${f.name}`}><ExternalLink size={13} /></a>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mediagrid-drop" aria-hidden><ImageIcon size={16} /> Drop files to upload to <code>{md.dir}</code></div>
      </div>

      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={del} danger busy={!!busy} title={`Delete ${selected.size} file${selected.size === 1 ? '' : 's'}?`} confirmLabel="Delete" body="This commits the deletions to the repo. Any entry still using one of these files will show a broken image until it is edited. History keeps the files." />
    </div>
  );
};
