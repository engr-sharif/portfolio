/**
 * Recruiter bar behaviour: session dismissal + the no-scroll-timeline fallback.
 * The slide-in itself is CSS (see RecruiterBar.astro).
 */
const DISMISS_KEY = 'recruiterBarDismissed';
let scrollHandler: (() => void) | null = null;

function init() {
  const bar = document.querySelector<HTMLElement>('[data-recruiter-bar]');
  if (!bar) return;

  let dismissed = false;
  try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { /* storage unavailable */ }
  if (dismissed) { bar.hidden = true; return; }
  bar.hidden = false;

  bar.querySelector('[data-recruiter-dismiss]')?.addEventListener('click', () => {
    bar.hidden = true;
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  }, { once: true });

  // Fallback for browsers without scroll-driven animations (the CSS handles
  // everything else): show after one viewport of scrolling.
  if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
  scrollHandler = null;
  if (CSS.supports?.('animation-timeline: scroll()')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // No motion: appear once the visitor has clearly left the hero.
    scrollHandler = () => bar.classList.toggle('is-static', window.scrollY > window.innerHeight * 0.9);
  } else {
    scrollHandler = () => bar.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.8);
  }
  window.addEventListener('scroll', scrollHandler, { passive: true });
  scrollHandler();
}

document.addEventListener('astro:page-load', init);
