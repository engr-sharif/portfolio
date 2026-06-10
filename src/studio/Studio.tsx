import { useEffect, useState, type FC } from 'react';
import { collections, getCollection, type Collection } from './schema';
import { isLoggedIn, login, logout, listEntries, getStats, saveOrder, duplicateEntry, type CollStat } from './studio-lib';
import { writeFile } from './api';
import { Editor } from './Editor';
import { PublishToast } from './PublishToast';

type View =
  | { name: 'dashboard' }
  | { name: 'list'; collectionId: string }
  | { name: 'edit'; collectionId: string; path: string | null };

const Studio: FC = () => {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [publishedAt, setPublishedAt] = useState(0); // bump to trigger the toast
  const [menuOpen, setMenuOpen] = useState(false);    // mobile drawer

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;

  const go = (v: View) => { setView(v); setMenuOpen(false); };
  const onPublished = () => setPublishedAt(Date.now());

  return (
    <div className={`st${menuOpen ? ' st--menu-open' : ''}`}>
      {/* Mobile top bar */}
      <header className="st-topbar">
        <button className="st-topbar__menu" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>
          <span /><span /><span />
        </button>
        <span className="st-topbar__brand"><span className="st-side__mark">◆</span> Studio</span>
      </header>

      <Sidebar
        active={view.name === 'list' || view.name === 'edit' ? (view as any).collectionId : ''}
        onNav={(id) => go(id ? { name: 'list', collectionId: id } : { name: 'dashboard' })}
        onLogout={() => { if (confirm('Sign out of the Studio?')) { logout(); setAuthed(false); } }}
      />
      {menuOpen && <div className="st-scrim" onClick={() => setMenuOpen(false)} />}

      <main className="st-main">
        {view.name === 'dashboard' && <Dashboard onOpen={(id) => go({ name: 'list', collectionId: id })} onNew={(id) => go({ name: 'edit', collectionId: id, path: null })} />}
        {view.name === 'list' && (
          <CollectionList
            collection={getCollection(view.collectionId)!}
            onNew={() => go({ name: 'edit', collectionId: view.collectionId, path: null })}
            onOpen={(path) => go({ name: 'edit', collectionId: view.collectionId, path })}
          />
        )}
        {view.name === 'edit' && (
          <Editor
            collection={getCollection(view.collectionId)!}
            path={view.path}
            onPublished={onPublished}
            onDone={() => go(getCollection(view.collectionId)!.kind === 'file' ? { name: 'dashboard' } : { name: 'list', collectionId: view.collectionId })}
          />
        )}
      </main>
      <PublishToast trigger={publishedAt} />
    </div>
  );
};

/* ------------------------------------------------------------------- Login */
const Login: FC<{ onAuthed: () => void }> = ({ onAuthed }) => {
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
    <div className="st-login">
      <form className="st-login__card" onSubmit={submit}>
        <div className="st-login__brand">
          <span className="st-login__mark">◆</span>
          <span>Studio</span>
        </div>
        <p className="st-login__sub">Sign in to edit your site.</p>
        <input type="password" className="st-login__input" placeholder="Password" value={pw}
          autoFocus onChange={(e) => setPw(e.target.value)} />
        {err && <p className="st-login__err">{err}</p>}
        <button className="st-btn st-btn--primary st-login__btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
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
    <nav className="st-side__nav">
      <button className={`st-side__link${active === '' ? ' is-active' : ''}`} onClick={() => onNav('')}>Dashboard</button>
      {collections.map((c) => (
        <button key={c.id} className={`st-side__link${active === c.id ? ' is-active' : ''}`} onClick={() => onNav(c.id)}>
          {c.label}
        </button>
      ))}
    </nav>
    <div className="st-side__foot">
      <a className="st-side__link" href="/portfolio/" target="_blank" rel="noopener">View site ↗</a>
      <button className="st-side__link" onClick={onLogout}>Sign out</button>
    </div>
  </aside>
);

/* --------------------------------------------------------------- Dashboard */
const Dashboard: FC<{ onOpen: (id: string) => void; onNew: (id: string) => void }> = ({ onOpen, onNew }) => {
  const folders = collections.filter((c) => c.kind === 'folder');
  const [stats, setStats] = useState<CollStat[]>([]);
  const statOf = (id: string) => stats.find((s) => s.id === id);

  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  return (
    <div className="st-dash">
      <header className="st-dash__head">
        <h1>Welcome back</h1>
        <p>Edit anything on your site. Saves commit to GitHub and rebuild automatically.</p>
      </header>

      <div className="st-dash__quick">
        {folders.map((c) => (
          <button key={c.id} className="st-dash__new" onClick={() => onNew(c.id)}>+ New {c.label.replace(/s$/, '')}</button>
        ))}
      </div>

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
    </div>
  );
};

/* ----------------------------------------------------------- CollectionList */
type Row = { path: string; label: string; status?: string };
const CollectionList: FC<{ collection: Collection; onNew: () => void; onOpen: (path: string) => void }> = ({ collection, onNew, onOpen }) => {
  const [entries, setEntries] = useState<Row[]>([]);
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
  }, [collection.id]);

  if (collection.kind === 'file') return null;

  const move = (i: number, d: number) => {
    const t = i + d; if (t < 0 || t >= entries.length) return;
    const n = [...entries]; [n[i], n[t]] = [n[t], n[i]]; setEntries(n);
  };
  const persistOrder = async () => {
    setSavingOrder(true);
    try { await saveOrder(entries.map((e) => e.path)); setReordering(false); }
    catch (e: any) { setError(e.message); }
    finally { setSavingOrder(false); }
  };
  const duplicate = async (path: string) => {
    try {
      const doc = await duplicateEntry(path, collection.labelField);
      const base = slugifyLabel(String(doc.data[collection.labelField] || 'copy'));
      const newPath = `${collection.dir}/${base}.md`;
      const { stringify } = await import('./frontmatter');
      await writeFile(newPath, stringify(doc), `studio: duplicate ${doc.data[collection.labelField] || ''}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const filtered = q.trim()
    ? entries.filter((e) => e.label.toLowerCase().includes(q.toLowerCase()))
    : entries;

  return (
    <div className="st-list">
      <header className="st-list__head">
        <h1>{collection.label}</h1>
        <div className="st-list__head-actions">
          {canReorder && entries.length > 1 && (
            reordering
              ? <button className="st-btn st-btn--primary" onClick={persistOrder} disabled={savingOrder}>{savingOrder ? 'Saving…' : 'Done reordering'}</button>
              : <button className="st-btn" onClick={() => setReordering(true)}>Reorder</button>
          )}
          <button className="st-btn st-btn--primary" onClick={onNew}>+ New {collection.label.replace(/s$/, '')}</button>
        </div>
      </header>

      {entries.length > 4 && !reordering && (
        <input className="sf__input st-list__search" placeholder={`Search ${collection.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {error && <div className="st-error">{error}</div>}
      {loading ? <div className="st-loading">Loading…</div> : (
        <ul className="st-list__items">
          {filtered.length === 0 && <li className="st-list__empty">{q ? 'No matches.' : 'No entries yet. Create your first one.'}</li>}
          {filtered.map((e, i) => (
            <li key={e.path} className="st-list__row">
              {reordering ? (
                <div className="st-list__item st-list__item--reorder">
                  <span className="st-list__label">{e.label}</span>
                  <span className="st-list__reorder">
                    <button onClick={() => move(i, -1)} aria-label="Up">↑</button>
                    <button onClick={() => move(i, 1)} aria-label="Down">↓</button>
                  </span>
                </div>
              ) : (
                <>
                  <button className="st-list__item" onClick={() => onOpen(e.path)}>
                    <span className="st-list__label">{e.label}</span>
                    {e.status && <span className={`st-list__status st-list__status--${e.status}`}>{e.status}</span>}
                  </button>
                  <button className="st-list__dup" title="Duplicate" onClick={() => duplicate(e.path)}>⧉</button>
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
