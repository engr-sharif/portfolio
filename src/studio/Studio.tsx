import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { collections, getCollection, type Collection } from './schema';
import { isLoggedIn, login, logout, listEntries, getStats, saveOrder, duplicateEntry, uniqueEntryPath, timeAgo, type CollStat, type EntryRow } from './studio-lib';
import { writeFile, history, type HistoryEntry } from './api';
import { stringify } from './frontmatter';
import { Editor } from './Editor';
import { PublishToast } from './PublishToast';
import { FieldLog } from './FieldLog';

type View =
  | { name: 'dashboard' }
  | { name: 'list'; collectionId: string }
  | { name: 'edit'; collectionId: string; path: string | null }
  | { name: 'fieldlog' };

const SITE_URL = import.meta.env.BASE_URL; // the site's base path, whatever host it's on

const Studio: FC = () => {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [expired, setExpired] = useState(false);   // session lapsed mid-work → overlay, keep editor mounted
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [publishedAt, setPublishedAt] = useState(0); // bump to trigger the toast
  const [menuOpen, setMenuOpen] = useState(false);    // mobile drawer
  const dirty = useRef(false);                        // the open editor's unsaved state

  // A 401 anywhere in the app lands here. We do NOT tear the UI down — the
  // author re-authenticates in place and their unsaved edits survive.
  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener('studio:unauthorized', onExpired);
    return () => window.removeEventListener('studio:unauthorized', onExpired);
  }, []);

  const onDirtyChange = useCallback((d: boolean) => { dirty.current = d; }, []);

  // Offline shell for the field log: the Studio opens with no signal once it
  // has been visited online. Scoped to /studio/ only.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`${SITE_URL}studio-sw.js`, { scope: `${SITE_URL}studio/` }).catch(() => { /* optional */ });
    // Hand the worker every same-origin asset this page already loaded (they
    // were fetched before it was in control), so the shell works offline
    // after a single online visit.
    const precache = () => navigator.serviceWorker.ready.then((reg) => {
      const urls = new Set<string>();
      for (const e of performance.getEntriesByType('resource')) urls.add(e.name);
      document.querySelectorAll<HTMLElement>('script[src], link[href]').forEach((el) => urls.add((el as HTMLScriptElement).src || (el as HTMLLinkElement).href));
      const keep = [...urls].filter((u) => u.startsWith(location.origin) && /\/_astro\/|\.(woff2?|svg|webmanifest)(\?|$)/.test(u));
      reg.active?.postMessage({ type: 'precache', urls: keep });
    }).catch(() => { /* optional */ });
    const t1 = setTimeout(precache, 1500), t2 = setTimeout(precache, 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  /** Every navigation funnels through here so unsaved work is never lost silently. */
  const go = (v: View) => {
    if (dirty.current && !confirm('You have unsaved changes. Discard them and leave?')) return;
    dirty.current = false;
    setView(v); setMenuOpen(false);
  };
  const [publishedCommit, setPublishedCommit] = useState<string | null>(null);
  const onPublished = (commit?: string | null) => { setPublishedCommit(commit ?? null); setPublishedAt(Date.now()); };
  const onLogout = () => {
    const msg = dirty.current
      ? 'You have unsaved changes. Sign out and discard them?'
      : 'Sign out of the Studio?';
    if (!confirm(msg)) return;
    dirty.current = false;
    logout(); setAuthed(false); setView({ name: 'dashboard' });
  };

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;

  return (
    <div className={`st${menuOpen ? ' st--menu-open' : ''}`}>
      {/* Mobile top bar */}
      <header className="st-topbar">
        <button className="st-topbar__menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <span /><span /><span />
        </button>
        <span className="st-topbar__brand"><span className="st-side__mark">◆</span> Studio</span>
      </header>

      <Sidebar
        active={view.name === 'list' || view.name === 'edit' ? view.collectionId : view.name === 'fieldlog' ? 'fieldlog' : ''}
        onNav={(id) => go(id === 'fieldlog' ? { name: 'fieldlog' } : id ? { name: 'list', collectionId: id } : { name: 'dashboard' })}
        onLogout={onLogout}
      />
      {menuOpen && <div className="st-scrim" onClick={() => setMenuOpen(false)} />}

      <main className="st-main">
        {view.name === 'fieldlog' && <FieldLog onPublished={onPublished} onOpen={(path) => go({ name: 'edit', collectionId: 'blog', path })} />}
        {view.name === 'dashboard' && <Dashboard onOpen={(id) => go({ name: 'list', collectionId: id })} onNew={(id) => go({ name: 'edit', collectionId: id, path: null })} />}
        {view.name === 'list' && (
          <CollectionList
            collection={getCollection(view.collectionId)!}
            onNew={() => go({ name: 'edit', collectionId: view.collectionId, path: null })}
            onOpen={(path) => go({ name: 'edit', collectionId: view.collectionId, path })}
            onPublished={onPublished}
          />
        )}
        {view.name === 'edit' && (
          <Editor
            collection={getCollection(view.collectionId)!}
            path={view.path}
            onPublished={onPublished}
            onDirtyChange={onDirtyChange}
            onDone={() => { dirty.current = false; setView(getCollection(view.collectionId)!.kind === 'file' ? { name: 'dashboard' } : { name: 'list', collectionId: view.collectionId }); }}
          />
        )}
      </main>
      <PublishToast trigger={publishedAt} commit={publishedCommit} />

      {expired && (
        <Login
          overlay
          onAuthed={() => setExpired(false)}
          onCancel={() => { setExpired(false); setAuthed(false); }}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------- Login */
const Login: FC<{ onAuthed: () => void; overlay?: boolean; onCancel?: () => void }> = ({ onAuthed, overlay, onCancel }) => {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(pw); onAuthed(); }
    catch (e: any) { setErr(e.message || 'Login failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`st-login${overlay ? ' st-login--overlay' : ''}`} role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label={overlay ? 'Session expired' : undefined}>
      <form className="st-login__card" onSubmit={submit}>
        <div className="st-login__brand">
          <span className="st-login__mark">◆</span>
          <span>Studio</span>
        </div>
        <p className="st-login__sub">
          {overlay ? 'Your session expired. Sign in to continue — your unsaved work is still here.' : 'Sign in to edit your site.'}
        </p>
        <input type="password" className="st-login__input" placeholder="Password" value={pw}
          autoFocus autoComplete="current-password" onChange={(e) => setPw(e.target.value)} />
        {err && <p className="st-login__err" role="alert">{err}</p>}
        <button className="st-btn st-btn--primary st-login__btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {overlay && onCancel && (
          <button type="button" className="st-btn st-btn--ghost st-login__btn" onClick={onCancel}>Sign out instead</button>
        )}
      </form>
    </div>
  );
};

/* ----------------------------------------------------------------- Sidebar */
const Sidebar: FC<{ active: string; onNav: (id: string) => void; onLogout: () => void }> = ({ active, onNav, onLogout }) => (
  <aside className="st-side">
    <button className="st-side__brand" onClick={() => onNav('')}>
      <span className="st-side__mark">◆</span> Studio
    </button>
    <nav className="st-side__nav" aria-label="Collections">
      <button className={`st-side__link${active === '' ? ' is-active' : ''}`} onClick={() => onNav('')}>Dashboard</button>
      <button className={`st-side__link st-side__link--field${active === 'fieldlog' ? ' is-active' : ''}`} onClick={() => onNav('fieldlog')} aria-current={active === 'fieldlog' ? 'page' : undefined}>Field log <span className="st-side__tag">offline</span></button>
      {collections.map((c) => (
        <button key={c.id} className={`st-side__link${active === c.id ? ' is-active' : ''}`} onClick={() => onNav(c.id)} aria-current={active === c.id ? 'page' : undefined}>
          {c.label}
        </button>
      ))}
    </nav>
    <div className="st-side__foot">
      <a className="st-side__link" href={SITE_URL} target="_blank" rel="noopener">View site ↗</a>
      <button className="st-side__link" onClick={onLogout}>Sign out</button>
    </div>
  </aside>
);

/* --------------------------------------------------------------- Dashboard */
const Dashboard: FC<{ onOpen: (id: string) => void; onNew: (id: string) => void }> = ({ onOpen, onNew }) => {
  const folders = collections.filter((c) => c.kind === 'folder');
  const [stats, setStats] = useState<CollStat[]>([]);
  const [statsErr, setStatsErr] = useState('');
  const [activity, setActivity] = useState<HistoryEntry[] | null>(null);
  const statOf = (id: string) => stats.find((s) => s.id === id);

  useEffect(() => { getStats().then(setStats).catch((e) => setStatsErr(e?.message || '')); }, []);
  // Recent commits to the site — silent on an older Worker without /api/history.
  useEffect(() => { history(undefined, 8).then(setActivity).catch(() => setActivity(null)); }, []);

  return (
    <div className="st-dash">
      <header className="st-dash__head">
        <h1 className="st-page-title">Welcome back</h1>
        <p>Edit anything on your site. Saves commit to GitHub and rebuild automatically.</p>
      </header>

      <div className="st-dash__quick">
        {folders.map((c) => (
          <button key={c.id} className="st-dash__new" onClick={() => onNew(c.id)}>+ New {c.label.replace(/s$/, '')}</button>
        ))}
      </div>

      {statsErr && <div className="st-error" role="alert">{statsErr}</div>}

      <div className="st-dash__grid">
        {collections.map((c) => {
          const s = statOf(c.id);
          return (
            <button key={c.id} className="st-card" onClick={() => onOpen(c.id)}>
              <span className="st-card__title">{c.label}</span>
              {s ? (
                <span className="st-card__stat u-mono">
                  {s.total} total
                  {s.draft > 0 && <span className="st-card__draft"> · {s.draft} draft</span>}
                </span>
              ) : (
                <span className="st-card__go">Manage →</span>
              )}
            </button>
          );
        })}
      </div>

      {activity && activity.length > 0 && (
        <section className="st-activity" aria-labelledby="st-activity-title">
          <h2 id="st-activity-title" className="st-activity__title">Recent changes</h2>
          <ol className="st-activity__list">
            {activity.map((a) => (
              <li key={a.sha} className="st-activity__item">
                <span className="st-activity__when u-mono">{timeAgo(a.date)}</span>
                <span className="st-activity__msg">{a.message.replace(/^studio:\s*/i, '')}</span>
                {a.url && <a className="st-activity__sha u-mono" href={a.url} target="_blank" rel="noreferrer">{a.sha.slice(0, 7)}</a>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
};

/* ----------------------------------------------------------- CollectionList */
const CollectionList: FC<{ collection: Collection; onNew: () => void; onOpen: (path: string) => void; onPublished: (commit?: string | null) => void }> = ({ collection, onNew, onOpen, onPublished }) => {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [reordering, setReordering] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const canReorder = collection.id === 'projects' || collection.id === 'tools';

  const load = async () => {
    setLoading(true); setError('');
    try { setEntries(await listEntries(collection)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (collection.kind === 'file') { onOpen(collection.file!); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id]);

  if (collection.kind === 'file') return null;

  // Reordering always works on the full, unfiltered list: a search filter
  // would make row indexes disagree with the entries being moved.
  const startReorder = () => { setQ(''); setReordering(true); };
  const move = (i: number, d: number) => {
    const t = i + d; if (t < 0 || t >= entries.length) return;
    const n = [...entries]; [n[i], n[t]] = [n[t], n[i]]; setEntries(n);
  };
  const persistOrder = async () => {
    setSavingOrder(true); setError('');
    try { const commit = await saveOrder(entries.map((e) => e.path)); setReordering(false); onPublished(commit); }
    catch (e: any) { setError(e.message); }
    finally { setSavingOrder(false); }
  };
  const duplicate = async (path: string, label: string) => {
    if (!confirm(`Duplicate “${label}” as a new draft?`)) return;
    setError('');
    try {
      const doc = await duplicateEntry(path, collection.labelField);
      const base = slugifyLabel(String(doc.data[collection.labelField] || 'copy'));
      const newPath = await uniqueEntryPath(collection.dir!, base);
      const res = await writeFile(newPath, stringify(doc), `studio: duplicate ${doc.data[collection.labelField] || ''}`);
      onPublished(res.commit);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const filtered = q.trim() && !reordering
    ? entries.filter((e) => e.label.toLowerCase().includes(q.toLowerCase()))
    : entries;

  return (
    <div className="st-list">
      <header className="st-list__head">
        <h1 className="st-page-title">{collection.label}</h1>
        <div className="st-list__head-actions">
          {canReorder && entries.length > 1 && (
            reordering
              ? <button className="st-btn st-btn--primary" onClick={persistOrder} disabled={savingOrder}>{savingOrder ? 'Saving…' : 'Done reordering'}</button>
              : <button className="st-btn" onClick={startReorder}>Reorder</button>
          )}
          <button className="st-btn st-btn--primary" onClick={onNew}>+ New {collection.label.replace(/s$/, '')}</button>
        </div>
      </header>

      {entries.length > 4 && !reordering && (
        <input className="sf__input st-list__search" type="search" placeholder={`Search ${collection.label.toLowerCase()}…`} aria-label={`Search ${collection.label}`} value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {error && <div className="st-error" role="alert">{error}</div>}
      {loading ? <div className="st-loading">Loading…</div> : (
        <ul className="st-list__items">
          {filtered.length === 0 && <li className="st-list__empty">{q ? 'No matches.' : 'No entries yet. Create your first one.'}</li>}
          {filtered.map((e, i) => (
            <li key={e.path} className="st-list__row">
              {reordering ? (
                <div className="st-list__item st-list__item--reorder">
                  <span className="st-list__label">{e.label}</span>
                  <span className="st-list__reorder">
                    <button onClick={() => move(i, -1)} aria-label={`Move ${e.label} up`} disabled={i === 0}>↑</button>
                    <button onClick={() => move(i, 1)} aria-label={`Move ${e.label} down`} disabled={i === entries.length - 1}>↓</button>
                  </span>
                </div>
              ) : (
                <>
                  <button className="st-list__item" onClick={() => onOpen(e.path)}>
                    <span className="st-list__label">{e.label}</span>
                    {e.status && (
                      <span className={`st-list__status st-list__status--${e.status}`} title={e.broken ? 'This file’s frontmatter can’t be read — open it to see the error.' : undefined}>
                        {e.broken ? 'needs repair' : e.status}
                      </span>
                    )}
                  </button>
                  {!e.broken && <button className="st-list__dup" title="Duplicate as draft" aria-label={`Duplicate ${e.label}`} onClick={() => duplicate(e.path, e.label)}>⧉</button>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const slugifyLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default Studio;
