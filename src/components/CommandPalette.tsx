/**
 * Command palette (⌘K / Ctrl-K). Quick-nav + full-text Pagefind search in one
 * dialog. Pagefind's bundle is loaded lazily on first open (never on page load),
 * so it costs nothing until used. Fully keyboard-driven, focus-trapped, and
 * accessible. The base path is injected by the host (for /portfolio/ subpath).
 */
import { useEffect, useRef, useState, useCallback, type FC } from 'react';

interface NavItem { label: string; href: string; hint: string }
interface Props {
  base: string;            // e.g. "/portfolio/"
  nav: NavItem[];          // static quick links
}

interface Result {
  url: string;
  title: string;
  excerpt: string;
}

const CommandPalette: FC<Props> = ({ base, nav }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefind = useRef<any>(null);

  // Lazy-load the Pagefind bundle on first open.
  const loadPagefind = useCallback(async () => {
    if (pagefind.current) return;
    try {
      // path is fingerprinted under the site base; built by astro-pagefind
      const mod = await import(/* @vite-ignore */ `${base}pagefind/pagefind.js`);
      await mod.init?.();
      pagefind.current = mod;
    } catch {
      pagefind.current = null; // search unavailable (e.g. dev) → nav-only
    }
  }, [base]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setActive(0);
  }, []);

  // Global ⌘K / Ctrl-K + "/" to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !isTyping())) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Listen for clicks on any [data-open-search] trigger.
  useEffect(() => {
    const onTrigger = (e: Event) => {
      if ((e.target as HTMLElement)?.closest?.('[data-open-search]')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('click', onTrigger);
    return () => document.removeEventListener('click', onTrigger);
  }, []);

  useEffect(() => {
    if (open) {
      loadPagefind();
      requestAnimationFrame(() => inputRef.current?.focus());
      document.documentElement.style.overflow = 'hidden';
      window.__lenis?.stop?.();
    } else {
      document.documentElement.style.overflow = '';
      window.__lenis?.start?.();
    }
  }, [open, loadPagefind]);

  // Run search (debounced).
  useEffect(() => {
    if (!query.trim()) { setResults([]); setActive(0); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      await loadPagefind();
      if (!pagefind.current) return;
      const search = await pagefind.current.search(query);
      const data: Result[] = await Promise.all(
        search.results.slice(0, 6).map(async (r: any) => {
          const d = await r.data();
          return { url: d.url, title: d.meta?.title || d.url, excerpt: d.excerpt };
        }),
      );
      if (!cancelled) { setResults(data); setActive(0); }
    }, 160);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, loadPagefind]);

  // Combined list: nav (when no query) or search results.
  const showNav = !query.trim();
  const items = showNav
    ? nav.map((n) => ({ url: n.href, title: n.label, excerpt: n.hint }))
    : results;

  const go = (url: string) => {
    close();
    // Pagefind URLs are absolute from server root and already include the base.
    window.location.href = url;
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); go(items[active].url); }
  };

  if (!open) return null;

  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cmdk__panel" onKeyDown={onListKey}>
        <div className="cmdk__inputrow">
          <span className="cmdk__icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="cmdk__input"
            placeholder="Search projects, tools, writing…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
            autoComplete="off"
          />
          <kbd className="cmdk__esc">ESC</kbd>
        </div>
        <ul className="cmdk__list" role="listbox">
          {items.length === 0 && query.trim() && (
            <li className="cmdk__empty">No matches for “{query}”.</li>
          )}
          {showNav && <li className="cmdk__sep">Go to</li>}
          {items.map((it, i) => (
            <li key={it.url + i}>
              <button
                className={`cmdk__item${i === active ? ' is-active' : ''}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it.url)}
              >
                <span className="cmdk__title">{it.title}</span>
                {it.excerpt && <span className="cmdk__excerpt" dangerouslySetInnerHTML={{ __html: it.excerpt }} />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
}

export default CommandPalette;
