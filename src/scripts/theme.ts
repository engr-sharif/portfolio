/**
 * Field (light) / Lab (dark). The inline gate in BaseLayout sets data-theme
 * before first paint from the saved choice or the OS setting; this wires the
 * toggle, remembers the choice, and follows the OS until the reader chooses.
 */
const KEY = 'theme';
type Theme = 'light' | 'dark';

const root = document.documentElement;
const current = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');

function label() {
  const next = current() === 'dark' ? 'day (Field)' : 'night (Lab)';
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-label', `Switch to the ${next} theme`));
}

function apply(t: Theme, remember: boolean) {
  const swap = () => {
    root.dataset.theme = t;
    label();
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  };
  // A same-document view transition gives the switch a soft crossfade.
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (doc.startViewTransition && !reduced) doc.startViewTransition(swap); else swap();
  if (remember) { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } }
}

export function initTheme() {
  label();
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest('[data-theme-toggle]');
    if (btn) apply(current() === 'dark' ? 'light' : 'dark', true);
  });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (saved !== 'light' && saved !== 'dark') apply(e.matches ? 'dark' : 'light', false);
  });
}
