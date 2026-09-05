import { useCallback, useEffect, useState, type FC } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Router, Switch, useLocation, useParams, Redirect } from 'wouter';
import { isLoggedIn, clearToken, isMock, setMock } from '../api';
import { getCollection } from '../schema';
import { ToastProvider, useToast } from '../ui/Toaster';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { Shell } from '../features/shell/Shell';
import { Login } from '../features/auth/Login';
import { Dashboard } from '../features/dashboard/Dashboard';
import { CollectionPage } from '../features/collection/CollectionPage';
import { EditorPage } from '../features/editor/EditorPage';
import { FieldLog } from '../FieldLog';

/**
 * Studio 2.0 root: providers (query cache, toasts), path routing under
 * <base>/studio, the ⌘K palette, theme, service worker, and the session gate
 * (an expired session shows the login as an overlay so edits survive).
 */
const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/studio`;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

// ?mock=1 / ?mock=0 flips demo mode before anything renders.
try {
  const m = new URLSearchParams(location.search).get('mock');
  if (m === '1') setMock(true); else if (m === '0') setMock(false);
  if (m !== null) history.replaceState(null, '', location.pathname);
} catch { /* fine */ }

type Theme = 'dark' | 'light';
const readTheme = (): Theme => { try { return (localStorage.getItem('studio.theme') as Theme) || 'dark'; } catch { return 'dark'; } };

const Routes: FC<{ onDirty: (d: boolean) => void }> = ({ onDirty }) => {
  const [loc] = useLocation();
  return (
    <ErrorBoundary key={loc}>
      <Switch>
        <Route path="/"><Dashboard /></Route>
        <Route path="/c/:id"><CollectionRoute /></Route>
        <Route path="/c/:id/new"><EditorRoute onDirty={onDirty} isNew /></Route>
        <Route path="/c/:id/e/:slug"><EditorRoute onDirty={onDirty} /></Route>
        <Route path="/file/:id"><EditorRoute onDirty={onDirty} /></Route>
        <Route path="/field-log"><FieldLogRoute /></Route>
        <Route><Redirect to="/" /></Route>
      </Switch>
    </ErrorBoundary>
  );
};

const CollectionRoute: FC = () => {
  const { id } = useParams<{ id: string }>();
  const c = getCollection(id);
  if (!c || c.kind !== 'folder') return <Redirect to="/" />;
  return <CollectionPage key={c.id} collection={c} />;
};

const EditorRoute: FC<{ onDirty: (d: boolean) => void; isNew?: boolean }> = ({ onDirty, isNew }) => {
  const { id, slug } = useParams<{ id: string; slug?: string }>();
  const c = getCollection(id);
  if (!c) return <Redirect to="/" />;
  const path = c.kind === 'file' ? c.file! : isNew ? null : `${c.dir}/${slug}.md`;
  return <EditorPage key={`${c.id}:${path ?? 'new'}`} collection={c} path={path} onDirtyChange={onDirty} />;
};

const FieldLogRoute: FC = () => {
  const [, navigate] = useLocation();
  const { publish } = useToast();
  return <FieldLog onPublished={(c) => publish(c, 'Publishing field note')} onOpen={(path) => { const slug = (path.split('/').pop() || '').replace(/\.mdx?$/, ''); navigate(`/c/blog/e/${slug}`); }} />;
};

const Inner: FC = () => {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [expired, setExpired] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [palette, setPalette] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('studio.theme', theme); } catch { /* fine */ } }, [theme]);
  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener('studio:unauthorized', onExpired);
    return () => window.removeEventListener('studio:unauthorized', onExpired);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // Offline shell for the field log (see public/studio-sw.js).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}studio-sw.js`, { scope: `${base}studio/` }).catch(() => { /* optional */ });
    const precache = () => navigator.serviceWorker.ready.then((reg) => {
      const urls = new Set<string>();
      for (const e of performance.getEntriesByType('resource')) urls.add(e.name);
      document.querySelectorAll<HTMLElement>('script[src], link[href]').forEach((el) => urls.add((el as HTMLScriptElement).src || (el as HTMLLinkElement).href));
      reg.active?.postMessage({ type: 'precache', urls: [...urls].filter((u) => u.startsWith(location.origin) && /\/_astro\/|\.(woff2?|svg|webmanifest)(\?|$)/.test(u)) });
    }).catch(() => { /* optional */ });
    const t1 = setTimeout(precache, 1500), t2 = setTimeout(precache, 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const signOut = useCallback(() => { if (dirty && !confirm('You have unsaved changes. Sign out anyway?')) return; clearToken(); queryClient.clear(); setAuthed(false); setExpired(false); }, [dirty]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const toggleMock = useCallback(() => { setMock(!isMock()); clearToken(); location.href = `${BASE}/`; }, []);

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return (
    <Router base={BASE}>
      <Shell theme={theme} onToggleTheme={toggleTheme} onOpenPalette={() => setPalette(true)} onSignOut={signOut}>
        <Routes onDirty={setDirty} />
      </Shell>
      <CommandPalette open={palette} onClose={() => setPalette(false)} ctx={{ theme, toggleTheme, signOut, toggleMock, mock: isMock() }} />
      {expired && <Login overlay onAuthed={() => setExpired(false)} onCancel={() => { setExpired(false); clearToken(); setAuthed(false); }} />}
    </Router>
  );
};

const App: FC = () => (
  <QueryClientProvider client={queryClient}>
    <ToastProvider>
      <Inner />
    </ToastProvider>
  </QueryClientProvider>
);
export default App;
