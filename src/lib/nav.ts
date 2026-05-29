/**
 * Mobile navigation toggle. Below the nav breakpoint the links collapse into a
 * full-screen overlay opened by the hamburger. Accessible: aria-expanded,
 * Escape to close, closes on link tap / resize to desktop, locks scroll (and
 * pauses Lenis) while open. Rebinds on every astro:page-load.
 */
function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const toggle = nav?.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const menu = nav?.querySelector<HTMLElement>('[data-nav-menu]');
  if (!nav || !toggle || !menu || toggle.dataset.bound) return;
  toggle.dataset.bound = '1';

  const setOpen = (open: boolean) => {
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
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));

  // Close when a link is tapped (same-page anchors + cross-page nav alike).
  menu.querySelectorAll('[data-nav-link]').forEach((a) =>
    a.addEventListener('click', () => setOpen(false)),
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // If the viewport grows back to desktop, make sure we don't leave it locked.
  const mq = window.matchMedia('(min-width: 768px)');
  mq.addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

document.addEventListener('astro:page-load', initNav);
// Reset lock state before swapping pages.
document.addEventListener('astro:before-swap', () => {
  document.documentElement.style.overflow = '';
});
