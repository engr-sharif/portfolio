import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, Loader2, X } from 'lucide-react';
import { deployStatus, type DeployState } from '../api';

/**
 * Toasts + the publish tracker. A publish creates a progress toast that polls
 * the site's build stamp until the deployed commit IS the one just written,
 * then flips to "Live" — or reports a failed build with the dashboard link.
 */
export type ToastKind = 'info' | 'success' | 'error' | 'progress';
export interface Toast { id: number; kind: ToastKind; title: ReactNode; description?: ReactNode; action?: { label: string; onClick: () => void }; duration?: number; href?: string }
interface Ctx {
  toast: (t: Omit<Toast, 'id'>) => number;
  update: (id: number, patch: Partial<Omit<Toast, 'id'>>) => void;
  dismiss: (id: number) => void;
  publish: (commit?: string | null, label?: string) => void;
}
const ToastCtx = createContext<Ctx | null>(null);
export const useToast = () => { const c = useContext(ToastCtx); if (!c) throw new Error('ToastProvider missing'); return c; };

const MAX_WAIT_MS = 4 * 60 * 1000;

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const tm = timers.current.get(id); if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);
  const schedule = useCallback((id: number, duration?: number) => {
    const tm = timers.current.get(id); if (tm) clearTimeout(tm);
    if (duration && duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss]);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    const duration = t.duration ?? (t.kind === 'progress' ? 0 : t.kind === 'error' ? 12000 : 5000);
    setToasts((ts) => [...ts.slice(-4), { ...t, id, duration }]);
    schedule(id, duration);
    return id;
  }, [schedule]);
  const update = useCallback((id: number, patch: Partial<Omit<Toast, 'id'>>) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.duration !== undefined) schedule(id, patch.duration);
  }, [schedule]);

  const publish = useCallback((commit?: string | null, label = 'Publishing') => {
    const since = Date.now();
    const id = toast({ kind: 'progress', title: `${label}…`, description: 'Committed. Cloudflare is rebuilding the site (about 2 minutes).' });
    const site = new URL(import.meta.env.BASE_URL, location.origin).href;
    const poll = async () => {
      const s = await deployStatus(since, commit);
      const state: DeployState = s.state;
      if (state === 'live') return update(id, { kind: 'success', title: 'Live', description: 'The site is rebuilt with your change.', href: s.url && !s.url.includes('cloudflare') ? s.url : site, action: { label: 'View site', onClick: () => window.open(site, '_blank', 'noopener') }, duration: 8000 });
      if (state === 'failed') return update(id, { kind: 'error', title: 'Build failed', description: 'Your change is committed, but the site did not rebuild. Open the build log to see why.', action: s.url ? { label: 'Open log', onClick: () => window.open(s.url, '_blank', 'noopener') } : undefined, duration: 30000 });
      if (Date.now() - since > MAX_WAIT_MS) return update(id, { kind: 'info', title: 'Committed', description: 'Could not confirm the rebuild within 4 minutes. It usually just takes longer; check the site in a moment.', duration: 12000 });
      setTimeout(poll, state === 'building' ? 6000 : 9000);
    };
    setTimeout(poll, 7000);
  }, [toast, update]);

  const value = useMemo(() => ({ toast, update, dismiss, publish }), [toast, update, dismiss, publish]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast__icon" aria-hidden>
              {t.kind === 'progress' ? <Loader2 className="spin" size={18} /> : t.kind === 'success' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
            </span>
            <div className="toast__body">
              <strong className="toast__title">{t.title}</strong>
              {t.description && <div className="toast__desc">{t.description}</div>}
              {t.action && <button type="button" className="toast__action" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>{t.action.label}</button>}
            </div>
            <button type="button" className="toast__x" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};
