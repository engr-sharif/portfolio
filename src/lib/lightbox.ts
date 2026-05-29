/**
 * Accessible image lightbox with a GSAP Flip open/close (the thumbnail morphs
 * up to full size). Keyboard: Enter/Space opens (buttons), Escape closes, focus
 * returns to the trigger. Reduced-motion users get an instant fade, no Flip.
 */
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

let overlay: HTMLElement | null = null;
let lastTrigger: HTMLElement | null = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image viewer');
  overlay.innerHTML = `
    <button class="lightbox__close" aria-label="Close image viewer">✕</button>
    <div class="lightbox__stage"></div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).closest('.lightbox__close')) close();
  });
  return overlay;
}

function open(trigger: HTMLElement) {
  const img = trigger.querySelector('img');
  if (!img) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  lastTrigger = trigger;

  const ov = ensureOverlay();
  const stage = ov.querySelector<HTMLElement>('.lightbox__stage')!;
  const clone = img.cloneNode(true) as HTMLImageElement;
  clone.removeAttribute('style');
  clone.className = 'lightbox__img';
  stage.replaceChildren(clone);

  ov.classList.add('is-open');
  document.documentElement.style.overflow = 'hidden';
  // pause Lenis if present
  window.__lenis?.stop?.();
  // a11y: take the rest of the page out of the AT tree + tab order while open
  document.getElementById('main')?.setAttribute('inert', '');
  document.querySelector('.site-nav')?.setAttribute('inert', '');
  document.querySelector('.site-footer')?.setAttribute('inert', '');

  if (!reduced) {
    const state = Flip.getState(img);
    // Place clone where the full image will be, then flip from thumbnail rect.
    Flip.fit(clone, state, { absolute: true });
    Flip.from(state, { duration: 0.5, ease: 'expo.out', absolute: true });
    gsap.fromTo(ov, { '--lb-bg': 0 }, { '--lb-bg': 1, duration: 0.4 });
  }

  (ov.querySelector('.lightbox__close') as HTMLElement)?.focus();
  document.addEventListener('keydown', onKey);
}

function close() {
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.documentElement.style.overflow = '';
  window.__lenis?.start?.();
  document.getElementById('main')?.removeAttribute('inert');
  document.querySelector('.site-nav')?.removeAttribute('inert');
  document.querySelector('.site-footer')?.removeAttribute('inert');
  document.removeEventListener('keydown', onKey);
  lastTrigger?.focus();
  lastTrigger = null;
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close();
    return;
  }
  // Focus trap: the only focusable control is the close button, so keep Tab on it.
  if (e.key === 'Tab' && overlay) {
    const closeBtn = overlay.querySelector<HTMLElement>('.lightbox__close');
    if (closeBtn) {
      e.preventDefault();
      closeBtn.focus();
    }
  }
}

function bind() {
  document.querySelectorAll<HTMLElement>('[data-lightbox]').forEach((el) => {
    if (el.dataset.lbBound) return;
    el.dataset.lbBound = '1';
    el.addEventListener('click', () => open(el));
  });
}

document.addEventListener('astro:page-load', bind);
document.addEventListener('astro:before-swap', close);
