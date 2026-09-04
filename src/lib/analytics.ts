/**
 * Privacy-friendly analytics (GoatCounter), loaded only when a site code is
 * configured in Site Settings. A module script (not inline) so it works under
 * the site's strict Content-Security-Policy; the GoatCounter host is added to
 * script-src by BaseLayout only when analytics is enabled.
 */
export {};

declare global {
  interface Window {
    goatcounter?: { count?: (opts: { path: string }) => void; no_onload?: boolean };
  }
}

function init() {
  const code = document.documentElement.dataset.goatcounter;
  if (!code || document.querySelector('script[data-goatcounter]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(s);
}

init();
// Count client-side (View Transition) navigations too.
document.addEventListener('astro:after-swap', () => {
  window.goatcounter?.count?.({ path: location.pathname });
});
