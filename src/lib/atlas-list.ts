/**
 * Field Atlas list → Living Atlas scene. Hovering / focusing a site row tells
 * the scene which node to light up (and the camera leans toward it). Delegated
 * listeners, registered once; the list itself is plain server-rendered HTML.
 */
let current: string | null = null;
const emit = (slug: string | null) => {
  if (slug === current) return;
  current = slug;
  window.dispatchEvent(new CustomEvent('atlas:active', { detail: slug }));
};

document.addEventListener('pointerover', (e) => {
  const row = (e.target as HTMLElement).closest?.('[data-atlas-slug]') as HTMLElement | null;
  if (row) emit(row.dataset.atlasSlug || null);
});
document.addEventListener('pointerout', (e) => {
  const row = (e.target as HTMLElement).closest?.('[data-atlas-slug]') as HTMLElement | null;
  const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
  if (row && !(to && row.contains(to))) emit(null);
});
document.addEventListener('focusin', (e) => {
  const row = (e.target as HTMLElement).closest?.('[data-atlas-slug]') as HTMLElement | null;
  if (row) emit(row.dataset.atlasSlug || null);
});
document.addEventListener('focusout', () => emit(null));
document.addEventListener('astro:before-swap', () => emit(null));

export {};
