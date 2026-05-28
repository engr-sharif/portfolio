/**
 * Global motion infrastructure — vanilla (no React island overhead).
 *
 * Responsibilities:
 *  - Lenis momentum smooth-scroll, synced to GSAP's ScrollTrigger + ticker.
 *  - Custom cursor + magnetic buttons (pointer devices only).
 *  - Declarative scroll reveals via [data-reveal].
 *  - Full prefers-reduced-motion + touch-device fallbacks.
 *
 * Designed to cooperate with Astro View Transitions: Lenis/cursor are created
 * once and persist; per-page bindings (reveals, magnetic, ScrollTrigger) are
 * torn down and rebuilt on every `astro:page-load`.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isTouch = () =>
  window.matchMedia('(hover: none), (pointer: coarse)').matches;

declare global {
  interface Window {
    __lenis?: Lenis;
    __motionInit?: boolean;
  }
}

/* ------------------------------------------------------------------ Lenis */
function initLenis() {
  if (window.__lenis || prefersReduced()) return; // reduced-motion: native scroll

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.6,
  });
  window.__lenis = lenis;

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Anchor links route through Lenis for smooth in-page jumps.
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement)?.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -80 });
    }
  });
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
  });

  // Grow over interactive targets.
  document.addEventListener('pointerover', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a, button, [data-cursor="hover"]')) {
      ring.classList.add('is-hover');
    }
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a, button, [data-cursor="hover"]')) {
      ring.classList.remove('is-hover');
    }
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

/* ---------------------------------------------------------------- Reveals */
function initReveals() {
  // Reduced motion: ensure everything is simply visible.
  if (prefersReduced()) {
    gsap.set('[data-reveal]', { clearProps: 'all', opacity: 1, y: 0 });
    return;
  }

  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    const delay = Number(el.dataset.revealDelay) || 0;
    gsap.fromTo(
      el,
      { y: 38, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.9,
        delay,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      },
    );
  });

  // Staggered groups.
  document.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((group) => {
    const items = group.querySelectorAll(':scope > *');
    gsap.fromTo(
      items,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'expo.out',
        stagger: 0.08,
        scrollTrigger: { trigger: group, start: 'top 85%', once: true },
      },
    );
  });
}

/* ------------------------------------------------------------- Page setup */
function setupPage() {
  initMagnetic();
  initReveals();
  ScrollTrigger.refresh();
}

export function bootMotion() {
  if (!window.__motionInit) {
    window.__motionInit = true;
    initLenis();
    initCursor();
  }
  setupPage();
}

// Run on first load and after every View Transition navigation.
document.addEventListener('astro:page-load', bootMotion);
// Clean ScrollTriggers before swapping pages to avoid stale triggers.
document.addEventListener('astro:before-swap', () => {
  ScrollTrigger.getAll().forEach((t) => t.kill());
});
