/**
 * Mobile navigation toggle. Below the nav breakpoint the links collapse into a
 * full-screen overlay opened by the hamburger. Accessible: aria-expanded,
 * Escape to close, closes on link tap / resize to desktop, locks scroll (and
 * pauses Lenis) while open.
 *
 * Lifecycle: the nav element is re-rendered on every View Transition, so the
 * per-element handlers rebind on astro:page-load. The document/matchMedia
 * listeners are registered ONCE at module level and look up the current nav
 * on each event — previously they re-registered on every navigation and
 * accumulated for the life of the tab.
 */
let current: { nav: HTMLElement; toggle: HTMLButtonElement } | null = null;

function setOpen(open: boolean) {
  if (!current) return;
  const { nav, toggle } = current;
  nav.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.documentElement.style.overflow = open ? 'hidden' : '';
  // Take the rest of the page out of the tab order / AT tree while open.
  const main = document.getElementById('main');
  const footer = document.querySelector('.site-footer');
  if (open) {
    main?.setAttribute('inert', '');
    footer?.setAttribute('inert', '');
    window.__lenis?.stop?.();
  } else {
    main?.removeAttribute('inert');
    footer?.removeAttribute('inert');
    window.__lenis?.start?.();
  }
}

const isOpen = () => !!current?.nav.classList.contains('is-open');

function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const toggle = nav?.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const menu = nav?.querySelector<HTMLElement>('[data-nav-menu]');
  if (!nav || !toggle || !menu) { current = null; return; }
  current = { nav, toggle };
  if (toggle.dataset.bound) return;
  toggle.dataset.bound = '1';

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  // Close when a link is tapped (same-page anchors + cross-page nav alike).
  menu.querySelectorAll('[data-nav-link]').forEach((a) =>
    a.addEventListener('click', () => setOpen(false)),
  );
}

// --- registered once ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen()) {
    setOpen(false);
    current?.toggle.focus();
  }
});

// If the viewport grows back to desktop, make sure we don't leave it locked.
window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
  if (e.matches && isOpen()) setOpen(false);
});

document.addEventListener('astro:page-load', initNav);
// Reset lock state before swapping pages.
document.addEventListener('astro:before-swap', () => {
  document.documentElement.style.overflow = '';
  document.getElementById('main')?.removeAttribute('inert');
  current = null;
});
