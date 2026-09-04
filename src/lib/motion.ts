/**
 * Global motion infrastructure — vanilla (no React island overhead).
 *
 * The scroll layer is native: the browser scrolls, CSS scroll-driven
 * animations (global.css → SCROLL-DRIVEN REVEALS) scrub reveals, parallax and
 * progress on the compositor. No smooth-scroll library, no scroll listeners.
 *
 * What still lives here:
 *  - Custom cursor + magnetic buttons (pointer devices only, GSAP quickTo).
 *  - A 2 KB IntersectionObserver fallback for browsers without
 *    `animation-timeline: view()` — it only toggles classes; the motion itself
 *    is still CSS.
 *  - View Transition hygiene: kill stale ScrollTriggers (count-up stats)
 *    before a swap; move focus to <main> after one.
 *
 * Full prefers-reduced-motion + touch-device fallbacks throughout.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isTouch = () =>
  window.matchMedia('(hover: none), (pointer: coarse)').matches;

/** True when the browser scrubs reveals natively — the fallback stays idle. */
const nativeScrollTimelines = () =>
  typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: view()');

declare global {
  interface Window {
    __motionInit?: boolean;
  }
}

/* ----------------------------------------------------------------- Cursor */
function initCursor() {
  if (isTouch() || prefersReduced() || document.querySelector('.cursor')) return;

  const dot = document.createElement('div');
  dot.className = 'cursor';
  dot.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(dot, ring);

  const xTo = gsap.quickTo(ring, 'x', { duration: 0.4, ease: 'power3' });
  const yTo = gsap.quickTo(ring, 'y', { duration: 0.4, ease: 'power3' });

  window.addEventListener('pointermove', (e) => {
    gsap.set(dot, { x: e.clientX, y: e.clientY });
    xTo(e.clientX);
    yTo(e.clientY);
  }, { passive: true });

  // Grow over interactive targets.
  document.addEventListener('pointerover', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a, button, [data-cursor="hover"]')) ring.classList.add('is-hover');
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a, button, [data-cursor="hover"]')) ring.classList.remove('is-hover');
  });
}

/* --------------------------------------------------------------- Magnetic */
let magneticCleanups: Array<() => void> = [];
function initMagnetic() {
  magneticCleanups.forEach((fn) => fn());
  magneticCleanups = [];
  if (isTouch() || prefersReduced()) return;

  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const strength = Number(el.dataset.magnetic) || 0.35;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const reset = () => {
      xTo(0);
      yTo(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', reset);
    magneticCleanups.push(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', reset);
    });
  });
}

/* ------------------------------------------------- Reveal fallback (Tier 2) */
// Browsers without scroll-driven animations get the same reveals as CSS
// transitions, triggered here. `.is-inview` starts the motion; `.is-settled`
// (a second later) hands transitions back to the component so hover effects
// behave normally afterwards.
const REVEAL_SELECTOR = '[data-reveal], [data-reveal-stagger], [data-figure], [data-topo]';
let revealObserver: IntersectionObserver | null = null;

function initRevealFallback() {
  revealObserver?.disconnect();
  revealObserver = null;
  if (nativeScrollTimelines()) return;

  const targets = [...document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)];
  if (!targets.length) return;

  if (prefersReduced() || typeof IntersectionObserver === 'undefined') {
    targets.forEach((el) => el.classList.add('is-inview', 'is-settled'));
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add('is-inview');
        setTimeout(() => el.classList.add('is-settled'), 1300);
        obs.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  );
  targets.forEach((el) => revealObserver!.observe(el));
}

/* ------------------------------------------------------------- Page setup */
function setupPage() {
  initMagnetic();
  initRevealFallback();
  ScrollTrigger.refresh();
}

export function bootMotion() {
  if (!window.__motionInit) {
    window.__motionInit = true;
    initCursor();
  }
  setupPage();
}

// Run on first load and after every View Transition navigation.
document.addEventListener('astro:page-load', bootMotion);
// Clean ScrollTriggers before swapping pages to avoid stale triggers.
document.addEventListener('astro:before-swap', () => {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  revealObserver?.disconnect();
  revealObserver = null;
});

// A11y: after a View Transition, move focus to <main> so keyboard/screen-reader
// users aren't stranded on the old document position. preventScroll so it
// doesn't fight the router's own hash scrolling.
document.addEventListener('astro:after-swap', () => {
  const main = document.getElementById('main');
  if (main && !location.hash) {
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }
});
