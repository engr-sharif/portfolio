/**
 * Nav: a hairline appears under it once the page has scrolled, and the mobile
 * menu opens as a full-screen sheet (focus is moved in, trapped by inert on the
 * page behind, and returned on close).
 */
export function initNav() {
  const root = document.documentElement;
  const onScroll = () => {
    if (window.scrollY > 8) root.setAttribute('data-scrolled', ''); else root.removeAttribute('data-scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const sheet = document.querySelector<HTMLElement>('[data-sheet]');
  const opener = document.querySelector<HTMLButtonElement>('[data-menu-open]');
  const closer = sheet?.querySelector<HTMLButtonElement>('[data-menu-close]');
  const page = document.querySelector<HTMLElement>('.page');
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!sheet || !opener || !closer) return;

  const open = () => {
    sheet.inert = false;
    sheet.setAttribute('data-open', '');
    if (page) page.inert = true;
    if (nav) nav.inert = true;
    root.style.overflow = 'hidden';
    opener.setAttribute('aria-expanded', 'true');
    closer.focus();
  };
  const close = () => {
    sheet.removeAttribute('data-open');
    sheet.inert = true;
    if (page) page.inert = false;
    if (nav) nav.inert = false;
    root.style.overflow = '';
    opener.setAttribute('aria-expanded', 'false');
    opener.focus();
  };
  opener.setAttribute('aria-expanded', 'false');
  opener.addEventListener('click', open);
  closer.addEventListener('click', close);
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  sheet.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) close(); });
  matchMedia('(min-width: 60rem)').addEventListener('change', (e) => { if (e.matches && sheet.hasAttribute('data-open')) close(); });
}
