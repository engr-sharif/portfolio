/**
 * SOTA image viewer.
 *
 * Click any [data-lightbox] thumbnail → it pops out of position and scales up
 * (GSAP Flip), then you can:
 *   - page through the whole gallery (data-gallery group) with arrows / keys /
 *     swipe, wrapping around;
 *   - zoom (wheel, double-click/tap, pinch) toward the cursor and drag to pan;
 *   - read a per-photo caption (data-caption);
 *   - close with Esc / the ✕ / backdrop tap / swipe-down.
 *
 * Each trigger carries: data-gallery (group id), data-caption, data-full (a
 * high-res source for crisp zoom) and contains the thumbnail <img>.
 * Fully accessible (dialog, focus trap, inert background, focus return) and
 * reduced-motion aware (no Flip, instant swaps). Pauses Lenis while open.
 */
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

interface Item {
  full: string;
  thumb: string;
  caption: string;
  alt: string;
  trigger: HTMLElement;
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let overlay: HTMLElement | null = null;
let imgEl: HTMLImageElement;
let captionEl: HTMLElement;
let counterEl: HTMLElement;
let stageEl: HTMLElement;

let group: Item[] = [];
let index = 0;
let lastTrigger: HTMLElement | null = null;

// zoom / pan transform state
let scale = 1;
let tx = 0;
let ty = 0;

const MIN = 1;
const MAX = 5;

/* ------------------------------------------------------------- build DOM */
function ensureOverlay(): HTMLElement {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image viewer');
  overlay.innerHTML = `
    <button class="viewer__btn viewer__close" aria-label="Close (Esc)">✕</button>
    <button class="viewer__btn viewer__nav viewer__prev" aria-label="Previous image">‹</button>
    <button class="viewer__btn viewer__nav viewer__next" aria-label="Next image">›</button>
    <div class="viewer__stage">
      <img class="viewer__img" alt="" draggable="false" />
    </div>
    <div class="viewer__bar">
      <p class="viewer__caption"></p>
      <span class="viewer__counter"></span>
    </div>`;
  document.body.appendChild(overlay);

  stageEl = overlay.querySelector('.viewer__stage')!;
  imgEl = overlay.querySelector('.viewer__img')!;
  captionEl = overlay.querySelector('.viewer__caption')!;
  counterEl = overlay.querySelector('.viewer__counter')!;

  overlay.querySelector('.viewer__close')!.addEventListener('click', close);
  overlay.querySelector('.viewer__prev')!.addEventListener('click', (e) => {
    e.stopPropagation();
    go(-1);
  });
  overlay.querySelector('.viewer__next')!.addEventListener('click', (e) => {
    e.stopPropagation();
    go(1);
  });
  // Backdrop click closes (only when not zoomed and not a drag).
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === stageEl) close();
  });

  bindGestures();
  return overlay;
}

/* ------------------------------------------------------------- transform */
function applyTransform(animate = false) {
  // clamp pan so the image can't be dragged entirely off-screen
  const w = imgEl.clientWidth * scale;
  const h = imgEl.clientHeight * scale;
  const maxX = Math.max(0, (w - window.innerWidth) / 2 + 40);
  const maxY = Math.max(0, (h - window.innerHeight * 0.82) / 2 + 40);
  tx = Math.max(-maxX, Math.min(maxX, tx));
  ty = Math.max(-maxY, Math.min(maxY, ty));
  const props = { x: tx, y: ty, scale };
  if (animate && !reduced()) gsap.to(imgEl, { ...props, duration: 0.3, ease: 'power3.out' });
  else gsap.set(imgEl, props);
  overlay?.classList.toggle('is-zoomed', scale > 1.01);
}

function resetZoom() {
  scale = 1;
  tx = 0;
  ty = 0;
  gsap.set(imgEl, { x: 0, y: 0, scale: 1 });
  overlay?.classList.remove('is-zoomed');
}

function zoomAt(clientX: number, clientY: number, next: number) {
  const target = Math.max(MIN, Math.min(MAX, next));
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const ox = clientX - cx;
  const oy = clientY - cy;
  const ratio = target / scale;
  tx = ox - (ox - tx) * ratio;
  ty = oy - (oy - ty) * ratio;
  scale = target;
  if (scale <= MIN + 0.01) {
    tx = 0;
    ty = 0;
  }
  applyTransform(true);
}

/* ------------------------------------------------------------- show item */
function render(dir = 0) {
  const item = group[index];
  resetZoom();
  counterEl.textContent = group.length > 1 ? `${index + 1} / ${group.length}` : '';
  captionEl.textContent = item.caption || '';
  captionEl.style.display = item.caption ? '' : 'none';

  const swap = () => {
    imgEl.src = item.full || item.thumb;
    imgEl.alt = item.alt || '';
  };

  if (dir === 0 || reduced()) {
    swap();
    return;
  }
  // slide + fade between images
  gsap
    .timeline()
    .to(imgEl, { xPercent: dir > 0 ? -6 : 6, autoAlpha: 0, duration: 0.18, ease: 'power2.in' })
    .add(swap)
    .set(imgEl, { xPercent: dir > 0 ? 6 : -6 })
    .to(imgEl, { xPercent: 0, autoAlpha: 1, duration: 0.32, ease: 'power3.out' });
}

function go(dir: number) {
  if (group.length < 2) return;
  index = (index + dir + group.length) % group.length;
  render(dir);
  // preload neighbours
  [1, -1].forEach((d) => {
    const n = group[(index + d + group.length) % group.length];
    if (n?.full) new Image().src = n.full;
  });
}

/* ------------------------------------------------------------- open/close */
function open(triggerEl: HTMLElement) {
  const groupId = triggerEl.dataset.gallery || 'default';
  const triggers = [
    ...document.querySelectorAll<HTMLElement>(`[data-lightbox][data-gallery="${groupId}"]`),
  ];
  const list = triggers.length ? triggers : [triggerEl];
  group = list.map((t) => {
    const im = t.querySelector('img');
    return {
      full: t.dataset.full || im?.currentSrc || im?.src || '',
      thumb: im?.currentSrc || im?.src || '',
      caption: t.dataset.caption || '',
      alt: im?.alt || '',
      trigger: t,
    };
  });
  index = Math.max(0, list.indexOf(triggerEl));
  lastTrigger = triggerEl;

  const ov = ensureOverlay();
  ov.classList.add('is-open');
  ov.classList.toggle('is-single', group.length < 2);
  document.documentElement.style.overflow = 'hidden';
  window.__lenis?.stop?.();
  document.getElementById('main')?.setAttribute('inert', '');
  document.querySelector('.site-nav')?.setAttribute('inert', '');
  document.querySelector('.site-footer')?.setAttribute('inert', '');

  render(0);

  // Pop-out: morph from the thumbnail rect to the centered image.
  const thumb = triggerEl.querySelector('img');
  if (thumb && !reduced()) {
    const state = Flip.getState(thumb);
    Flip.fit(imgEl, state, { absolute: true });
    Flip.from(state, {
      duration: 0.55,
      ease: 'expo.out',
      absolute: true,
      scale: true,
      onComplete: () => gsap.set(imgEl, { clearProps: 'all' }),
    });
    gsap.fromTo(ov, { '--v-bg': 0 }, { '--v-bg': 1, duration: 0.4 });
  } else {
    gsap.set(imgEl, { clearProps: 'all' });
  }

  (ov.querySelector('.viewer__close') as HTMLElement).focus();
  document.addEventListener('keydown', onKey);
}

function close() {
  if (!overlay) return;
  overlay.classList.remove('is-open', 'is-zoomed');
  document.documentElement.style.overflow = '';
  window.__lenis?.start?.();
  document.getElementById('main')?.removeAttribute('inert');
  document.querySelector('.site-nav')?.removeAttribute('inert');
  document.querySelector('.site-footer')?.removeAttribute('inert');
  document.removeEventListener('keydown', onKey);
  resetZoom();
  lastTrigger?.focus();
  lastTrigger = null;
}

function onKey(e: KeyboardEvent) {
  switch (e.key) {
    case 'Escape':
      close();
      break;
    case 'ArrowRight':
      go(1);
      break;
    case 'ArrowLeft':
      go(-1);
      break;
    case 'Tab': {
      // simple focus trap among the overlay buttons
      const f = overlay!.querySelectorAll<HTMLElement>('button');
      const list = [...f].filter((b) => b.offsetParent !== null);
      const i = list.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length;
      list[next]?.focus();
      break;
    }
  }
}

/* ------------------------------------------------------------- gestures */
function bindGestures() {
  const pointers = new Map<number, { x: number; y: number }>();
  let startScale = 1;
  let startDist = 0;
  let panning = false;
  let last = { x: 0, y: 0 };
  let downAt = { x: 0, y: 0, t: 0 };

  // wheel zoom
  stageEl.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18));
    },
    { passive: false },
  );

  // double-click toggle
  imgEl.addEventListener('dblclick', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, scale > 1.5 ? 1 : 2.6);
  });

  const dist = () => {
    const p = [...pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  };
  const mid = () => {
    const p = [...pointers.values()];
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  };

  stageEl.addEventListener('pointerdown', (e) => {
    stageEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      startDist = dist();
      startScale = scale;
    } else {
      panning = true;
      last = { x: e.clientX, y: e.clientY };
      downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
    }
  });

  stageEl.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const m = mid();
      zoomAt(m.x, m.y, startScale * (dist() / startDist));
      return;
    }
    if (!panning) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    if (scale > 1.01) {
      tx += dx;
      ty += dy;
      applyTransform(false);
    }
  });

  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (!panning) return;
    panning = false;
    const dx = e.clientX - downAt.x;
    const dy = e.clientY - downAt.y;
    const dt = Date.now() - downAt.t;
    // gestures only when not zoomed
    if (scale <= 1.01 && dt < 600) {
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
    }
  };
  stageEl.addEventListener('pointerup', release);
  stageEl.addEventListener('pointercancel', release);
}

/* ------------------------------------------------------------- bind triggers */
function bind() {
  document.querySelectorAll<HTMLElement>('[data-lightbox]').forEach((el) => {
    if (el.dataset.lbBound) return;
    el.dataset.lbBound = '1';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open(el);
    });
  });
}

document.addEventListener('astro:page-load', bind);
document.addEventListener('astro:before-swap', close);
