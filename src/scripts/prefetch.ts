/**
 * Prefetch the next page the moment the reader shows intent — pointer over a
 * link, or keyboard focus on it — so navigation (and its view transition)
 * feels instant. Same-origin page links only; never the Studio, downloads or
 * in-page anchors; skipped when the connection asks to save data.
 */
export function initPrefetch() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const done = new Set<string>([location.pathname]);
  const go = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.hasAttribute('download') || a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.includes('/studio') || done.has(url.pathname)) return;
    if (!/\/$|\.html$/.test(url.pathname)) return;
    done.add(url.pathname);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url.pathname;
    document.head.append(link);
  };
  document.addEventListener('pointerover', go, { passive: true });
  document.addEventListener('focusin', go);
}
