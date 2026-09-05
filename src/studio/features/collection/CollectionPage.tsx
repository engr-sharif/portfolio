import { useMemo, useState, type FC } from 'react';
import { useLocation } from 'wouter';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Search, MoreHorizontal, Copy, Trash2, Pencil, Eye, EyeOff, X } from 'lucide-react';
import type { Collection } from '../../schema';
import type { EntryRow } from '../../studio-lib';
import { useEntries, useReorder, useDuplicate, useBulk } from '../../app/queries';
import { useToast } from '../../ui/Toaster';
import { Button, Confirm, EmptyState, IconButton, Input, Menu, Pill, Skeleton } from '../../ui/primitives';

const slugOf = (path: string) => (path.split('/').pop() || '').replace(/\.mdx?$/, '');
type Filter = 'all' | 'live' | 'draft';

/**
 * Collection table. Rows drag by their handle (mouse, touch, or keyboard:
 * focus the handle, Space, arrows, Space) and the new order is saved as ONE
 * commit the moment you drop — with Undo in the toast. Checkboxes select rows
 * for bulk publish / unpublish / delete, also one commit each.
 */
export const CollectionPage: FC<{ collection: Collection }> = ({ collection }) => {
  const [, navigate] = useLocation();
  const { toast, publish } = useToast();
  const entries = useEntries(collection);
  const reorder = useReorder(collection);
  const duplicate = useDuplicate(collection);
  const bulk = useBulk(collection);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ action: 'delete' | 'publish' | 'unpublish'; rows: EntryRow[] } | null>(null);

  const sortable = collection.id !== 'blog' && collection.fields.some((f) => f.name === 'order');
  const rows = entries.data ?? [];
  const filtered = useMemo(() => rows.filter((r) => (filter === 'all' || r.status === filter) && (!q.trim() || r.label.toLowerCase().includes(q.toLowerCase()) || slugOf(r.path).includes(q.toLowerCase()))), [rows, q, filter]);
  const filteringActive = !!q.trim() || filter !== 'all';
  const canDrag = sortable && !filteringActive;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.path === active.id), to = rows.findIndex((r) => r.path === over.id);
    if (from < 0 || to < 0) return;
    const before = rows;
    const next = arrayMove(rows, from, to);
    reorder.mutate(next, {
      onSuccess: (commit) => {
        toast({ kind: 'success', title: 'Order saved', description: `${rows[from].label} moved to position ${to + 1}. One commit.`, action: { label: 'Undo', onClick: () => reorder.mutate(before, { onSuccess: (c2) => publish(c2, 'Reverting order') }) }, duration: 8000 });
        publish(commit, 'Publishing order');
      },
      onError: (err: any) => toast({ kind: 'error', title: 'Order not saved', description: err?.message }),
    });
  };

  const toggleSel = (path: string) => setSelected((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });
  const allSel = filtered.length > 0 && filtered.every((r) => selected.has(r.path));
  const runBulk = () => {
    if (!confirm) return;
    const { action, rows: target } = confirm;
    bulk.mutate({ rows: target, action }, {
      onSuccess: (commit) => { setConfirm(null); setSelected(new Set()); toast({ kind: 'success', title: `${target.length} ${action === 'delete' ? 'deleted' : action === 'publish' ? 'published' : 'unpublished'}`, description: 'One commit.' }); publish(commit ?? undefined); },
      onError: (err: any) => toast({ kind: 'error', title: 'Bulk action failed', description: err?.message }),
    });
  };
  const dup = (row: EntryRow) => duplicate.mutate(row, {
    onSuccess: ({ path, commit }) => { toast({ kind: 'success', title: 'Duplicated as a draft', action: { label: 'Open', onClick: () => navigate(`/c/${collection.id}/e/${slugOf(path)}`) } }); publish(commit); },
    onError: (err: any) => toast({ kind: 'error', title: 'Could not duplicate', description: err?.message }),
  });

  const singular = collection.label.replace(/s$/, '');
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">{collection.label}</h1>
          <p className="page__sub">{entries.data ? `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${rows.filter((r) => r.status === 'live').length} live` : ' '}{sortable ? ' · drag the handle to reorder' : collection.id === 'blog' ? ' · sorted by date' : ''}</p>
        </div>
        <div className="page__actions"><Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate(`/c/${collection.id}/new`)}>New {singular.toLowerCase()}</Button></div>
      </header>

      <div className="toolbar">
        <label className="toolbar__search"><Search size={15} aria-hidden /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${collection.label.toLowerCase()}…`} aria-label="Search" />{q && <IconButton variant="ghost" size="sm" label="Clear search" icon={<X size={13} />} onClick={() => setQ('')} />}</label>
        <div className="seg" role="tablist" aria-label="Filter by status">
          {(['all', 'live', 'draft'] as Filter[]).map((f) => <button key={f} type="button" role="tab" aria-selected={filter === f} className={`seg__btn${filter === f ? ' is-on' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        {sortable && filteringActive && <span className="toolbar__note">Clear search and filters to drag-reorder.</span>}
      </div>

      {selected.size > 0 && (
        <div className="bulkbar" role="region" aria-label="Bulk actions">
          <span className="bulkbar__count">{selected.size} selected</span>
          {collection.statusField && <Button size="sm" icon={<Eye size={14} />} onClick={() => setConfirm({ action: 'publish', rows: rows.filter((r) => selected.has(r.path)) })}>Publish</Button>}
          {collection.statusField && <Button size="sm" icon={<EyeOff size={14} />} onClick={() => setConfirm({ action: 'unpublish', rows: rows.filter((r) => selected.has(r.path)) })}>Unpublish</Button>}
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirm({ action: 'delete', rows: rows.filter((r) => selected.has(r.path)) })}>Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {entries.isLoading && <div className="tbl tbl--skeleton">{[0, 1, 2, 3].map((i) => <div key={i} className="tbl__row"><Skeleton w={18} h={18} /><Skeleton w="40%" /><Skeleton w={60} h={20} radius={999} /></div>)}</div>}
      {entries.isError && <EmptyState title="Could not load this collection" hint={(entries.error as Error)?.message} action={<Button onClick={() => entries.refetch()}>Retry</Button>} />}
      {entries.data && rows.length === 0 && <EmptyState title={`No ${collection.label.toLowerCase()} yet`} hint="Create the first one — it starts as a draft." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate(`/c/${collection.id}/new`)}>New {singular.toLowerCase()}</Button>} />}
      {entries.data && rows.length > 0 && filtered.length === 0 && <EmptyState title="Nothing matches" hint="Try a different search or filter." action={<Button variant="ghost" onClick={() => { setQ(''); setFilter('all'); }}>Clear</Button>} />}

      {filtered.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={filtered.map((r) => r.path)} strategy={verticalListSortingStrategy}>
            <div className={`tbl${canDrag ? ' tbl--sortable' : ''}`} role="table" aria-label={collection.label}>
              <div className="tbl__head" role="row">
                <span className="tbl__cell tbl__cell--check"><input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(filtered.map((r) => r.path)))} /></span>
                {canDrag && <span className="tbl__cell tbl__cell--grip" aria-hidden />}
                <span className="tbl__cell tbl__cell--main" role="columnheader">Title</span>
                <span className="tbl__cell tbl__cell--status" role="columnheader">Status</span>
                <span className="tbl__cell tbl__cell--actions" role="columnheader"><span className="sr-only">Actions</span></span>
              </div>
              {filtered.map((r, i) => (
                <Row key={r.path} row={r} index={i} collection={collection} canDrag={canDrag} selected={selected.has(r.path)} onSelect={() => toggleSel(r.path)} onOpen={() => navigate(`/c/${collection.id}/e/${slugOf(r.path)}`)} onDuplicate={() => dup(r)} onDelete={() => setConfirm({ action: 'delete', rows: [r] })} onToggle={collection.statusField ? () => setConfirm({ action: r.status === 'live' ? 'unpublish' : 'publish', rows: [r] }) : undefined} saving={reorder.isPending} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={runBulk} busy={bulk.isPending} danger={confirm?.action === 'delete'}
        title={confirm ? `${confirm.action === 'delete' ? 'Delete' : confirm.action === 'publish' ? 'Publish' : 'Unpublish'} ${confirm.rows.length === 1 ? `“${confirm.rows[0].label}”` : `${confirm.rows.length} ${collection.label.toLowerCase()}`}?` : ''}
        confirmLabel={confirm?.action === 'delete' ? 'Delete' : confirm?.action === 'publish' ? 'Publish' : 'Unpublish'}
        body={confirm?.action === 'delete' ? 'This commits a deletion to the repo. History keeps the file, so it can be restored from a commit.' : confirm?.action === 'publish' ? `${collection.id === 'projects' ? 'Projects go public only when every detail is cleared for sharing. ' : ''}This makes it visible on the site after the next build.` : 'This hides it from the site after the next build; nothing is deleted.'} />
    </div>
  );
};

const Row: FC<{ row: EntryRow; index: number; collection: Collection; canDrag: boolean; selected: boolean; saving: boolean; onSelect: () => void; onOpen: () => void; onDuplicate: () => void; onDelete: () => void; onToggle?: () => void }> = ({ row, index, canDrag, selected, saving, onSelect, onOpen, onDuplicate, onDelete, onToggle }) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.path, disabled: !canDrag });
  const [menu, setMenu] = useState(false);
  const tone = row.broken ? 'danger' : row.status === 'live' ? 'live' : row.status === 'draft' ? 'draft' : 'neutral';
  return (
    <div ref={setNodeRef} className={`tbl__row${isDragging ? ' is-dragging' : ''}${selected ? ' is-selected' : ''}`} role="row" style={{ transform: CSS.Transform.toString(transform), transition }} data-testid="entry-row">
      <span className="tbl__cell tbl__cell--check"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${row.label}`} /></span>
      {canDrag && (
        <button ref={setActivatorNodeRef} type="button" className="tbl__cell tbl__cell--grip grip" aria-label={`Reorder ${row.label}. Press space, use arrow keys, then space to drop.`} disabled={saving} {...attributes} {...listeners}><GripVertical size={16} /></button>
      )}
      <button type="button" className="tbl__cell tbl__cell--main tbl__open" onClick={onOpen}>
        <span className="tbl__idx">{String(index + 1).padStart(2, '0')}</span>
        <span className="tbl__title">{row.label}</span>
        <span className="tbl__slug">{slugOf(row.path)}</span>
      </button>
      <span className="tbl__cell tbl__cell--status">
        {onToggle && !row.broken ? (
          <button type="button" className="pillbtn" onClick={onToggle} title={row.status === 'live' ? 'Live — click to unpublish' : 'Draft — click to publish'}><Pill tone={tone} dot>{row.status}</Pill></button>
        ) : <Pill tone={tone} dot>{row.broken ? 'broken' : row.status || '—'}</Pill>}
      </span>
      <span className="tbl__cell tbl__cell--actions">
        <Menu open={menu} setOpen={setMenu} trigger={(p) => <IconButton variant="ghost" size="sm" label="More actions" icon={<MoreHorizontal size={16} />} {...p} />}
          items={[{ label: 'Open', icon: <Pencil size={14} />, onSelect: onOpen }, { label: 'Duplicate as draft', icon: <Copy size={14} />, onSelect: onDuplicate }, { label: 'Delete…', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete }]} />
      </span>
    </div>
  );
};
