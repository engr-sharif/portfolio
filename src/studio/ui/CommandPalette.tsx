import { useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Search, LayoutDashboard, Plus, FileText, MapPin, Settings, Sparkles, Images, LogOut, Moon, Sun, FlaskConical, Wrench, FolderKanban, PenLine } from 'lucide-react';
import { collections } from '../schema';
import type { EntryRow } from '../studio-lib';
import { Kbd } from './primitives';

/**
 * ⌘K — jump anywhere, create anything, find any entry already loaded. Items
 * come from the schema (collections) plus the query cache (entries), so it
 * works offline for whatever the app has seen.
 */
export interface PaletteContext { theme: 'dark' | 'light'; toggleTheme: () => void; signOut: () => void; toggleMock: () => void; mock: boolean }
interface Item { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void; keywords?: string }

export const collectionIcon = (id: string, size = 16) =>
  id === 'projects' ? <FolderKanban size={size} /> : id === 'blog' ? <PenLine size={size} /> : id === 'tools' ? <Wrench size={size} /> : id === 'gallery' ? <Images size={size} /> : id === 'ai' ? <Sparkles size={size} /> : <Settings size={size} />;

export const CommandPalette: FC<{ open: boolean; onClose: () => void; ctx: PaletteContext }> = ({ open, onClose, ctx }) => {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => { navigate(href); onClose(); };
    const out: Item[] = [
      { id: 'nav-dash', group: 'Go to', label: 'Dashboard', icon: <LayoutDashboard size={16} />, run: go('/') },
      ...collections.map((c) => ({ id: `nav-${c.id}`, group: 'Go to', label: c.label, icon: collectionIcon(c.id), run: go(c.kind === 'folder' ? `/c/${c.id}` : `/file/${c.id}`), hint: c.kind === 'folder' ? 'collection' : 'settings' })),
      { id: 'nav-fieldlog', group: 'Go to', label: 'Field log', hint: 'works offline', icon: <MapPin size={16} />, run: go('/field-log') },
      { id: 'nav-media', group: 'Go to', label: 'Media library', hint: 'upload · delete · copy paths', icon: <Images size={16} />, run: go('/media'), keywords: 'images photos files upload' },
      ...collections.filter((c) => c.kind === 'folder').map((c) => ({ id: `new-${c.id}`, group: 'Create', label: `New ${c.label.replace(/s$/, '').toLowerCase()}`, icon: <Plus size={16} />, run: go(`/c/${c.id}/new`) })),
      { id: 'theme', group: 'Preferences', label: ctx.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: ctx.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />, run: () => { ctx.toggleTheme(); onClose(); } },
      { id: 'mock', group: 'Preferences', label: ctx.mock ? 'Leave demo mode (use the real site)' : 'Try demo mode (in-memory copy of the site)', icon: <FlaskConical size={16} />, run: () => { ctx.toggleMock(); onClose(); }, keywords: 'mock demo sandbox' },
      { id: 'signout', group: 'Account', label: 'Sign out', icon: <LogOut size={16} />, run: () => { ctx.signOut(); onClose(); } },
    ];
    for (const [key, data] of qc.getQueriesData<EntryRow[]>({ queryKey: ['entries'] })) {
      const cid = String(key[1]);
      const col = collections.find((c) => c.id === cid);
      if (!col || !Array.isArray(data)) continue;
      for (const r of data) {
        const slug = (r.path.split('/').pop() || '').replace(/\.mdx?$/, '');
        out.push({ id: `e-${r.path}`, group: col.label, label: r.label, hint: r.status, icon: <FileText size={16} />, run: go(`/c/${cid}/e/${slug}`), keywords: slug });
      }
    }
    return out;
  }, [qc, navigate, onClose, ctx]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.filter((i) => !i.id.startsWith('e-')).slice(0, 14);
    const score = (i: Item) => {
      const hay = `${i.label} ${i.hint || ''} ${i.keywords || ''} ${i.group}`.toLowerCase();
      if (i.label.toLowerCase().startsWith(s)) return 3;
      if (i.label.toLowerCase().includes(s)) return 2;
      if (hay.includes(s)) return 1;
      return 0;
    };
    return items.map((i) => [i, score(i)] as const).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]).map(([i]) => i).slice(0, 12);
  }, [items, q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!open) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  let lastGroup = '';
  return createPortal(
    <div className="cmdk" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk__panel" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk__input">
          <Search size={16} aria-hidden />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Jump to, create, search entries…" aria-label="Search commands" autoComplete="off" spellCheck={false} autoFocus />
          <Kbd>esc</Kbd>
        </div>
        <div className="cmdk__list" ref={list} role="listbox">
          {filtered.length === 0 && <div className="cmdk__empty">Nothing matches “{q}”.</div>}
          {filtered.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="cmdk__group" key={`g-${it.group}`}>{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header}
                <button type="button" role="option" aria-selected={i === active} data-active={i === active} className={`cmdk__item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={it.run}>
                  <span className="cmdk__icon" aria-hidden>{it.icon}</span>
                  <span className="cmdk__label">{it.label}</span>
                  {it.hint && <span className="cmdk__hint">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk__foot"><span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span><span><Kbd>↵</Kbd> open</span><span><Kbd>⌘K</Kbd> toggle</span></div>
      </div>
    </div>,
    document.body,
  );
};
