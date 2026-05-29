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
    __anchorInit?: boolean;
  }
}

/* ------------------------------------------------------------------ Lenis */
function initLenis() {
  if (window.__lenis || prefersReduced()) return; // reduced-motion: native scroll

  // lerp (frame-rate-independent smoothing) feels snappier and more 1:1 than a
  // long duration ease — closer to the tight momentum on Apple/Stripe sites.
  const lenis = new Lenis({
    lerp: 0.11,
    wheelMultiplier: 1,
    smoothWheel: true,
    touchMultiplier: 1.5,
  });
  window.__lenis = lenis;

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ------------------------------------------------------------ Anchor scroll */
const NAV_OFFSET = 84; // keep targets clear of the fixed nav

/** Smoothly scroll to an in-page #target, via Lenis when available. */
function scrollToHash(hash: string, smooth = true): boolean {
  let target: Element | null = null;
  try {
    target = document.querySelector(hash);
  } catch {
    return false; // invalid selector
  }
  if (!target) return false;

  const lenis = window.__lenis;
  if (lenis && smooth) {
    lenis.scrollTo(target as HTMLElement, { offset: -NAV_OFFSET, duration: 1.1 });
  } else {
    // reduced-motion / no Lenis: native jump (scroll-margin-top handles offset)
    (target as HTMLElement).scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }
  return true;
}

/**
 * Intercept same-page hash links in the CAPTURE phase and handle the scroll
 * ourselves with Lenis — and stopImmediatePropagation so Astro's ClientRouter
 * never also tries to navigate (that double-handling was the "stutter"). Links
 * to a different page keep their default behaviour; the hash is honoured on the
 * next astro:page-load.
 */
function initAnchorScroll() {
  if (window.__anchorInit) return;
  window.__anchorInit = true;

  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (!url.hash || url.hash === '#') return;
      if (url.pathname !== location.pathname) return; // different page → let the router navigate
      if (scrollToHash(url.hash)) {
        // preventDefault is enough for Astro's router to skip a same-page hash
        // link (it checks defaultPrevented); we deliberately DON'T stop
        // propagation so other listeners (e.g. mobile-menu close) still fire.
        e.preventDefault();
        history.pushState(null, '', url.hash);
      }
    },
    true, // capture: run before ClientRouter's listener
  );

  // Honour a hash on (first or post-navigation) load — covers cross-page anchors
  // like a project page → "/#contact". Wait a frame so layout/ScrollTrigger settle.
  document.addEventListener('astro:page-load', () => {
    const hash = location.hash;
    if (hash && hash.length > 1) {
      requestAnimationFrame(() => setTimeout(() => scrollToHash(hash), 120));
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
    gsap.set('[data-reveal], [data-reveal-stagger] > *', { clearProps: 'all', opacity: 1, y: 0 });
    return;
  }

  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    const delay = Number(el.dataset.revealDelay) || 0;
    gsap.fromTo(
      el,
      { y: 34, opacity: 0, willChange: 'transform, opacity' },
      {
        y: 0,
        opacity: 1,
        duration: 0.85,
        delay,
        ease: 'expo.out',
        // willChange only while animating, then cleared — never a permanent layer
        clearProps: 'willChange',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      },
    );
  });

  // Staggered groups.
  document.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((group) => {
    const items = group.querySelectorAll(':scope > *');
    gsap.fromTo(
      items,
      { y: 36, opacity: 0, willChange: 'transform, opacity' },
      {
        y: 0,
        opacity: 1,
        duration: 0.75,
        ease: 'expo.out',
        stagger: 0.07,
        clearProps: 'willChange',
        scrollTrigger: { trigger: group, start: 'top 88%', once: true },
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
    initAnchorScroll();
  }
  setupPage();
}

// Run on first load and after every View Transition navigation.
document.addEventListener('astro:page-load', bootMotion);
// Clean ScrollTriggers before swapping pages to avoid stale triggers.
document.addEventListener('astro:before-swap', () => {
  ScrollTrigger.getAll().forEach((t) => t.kill());
});

// A11y: after a View Transition, move focus to <main> so keyboard/screen-reader
// users aren't stranded on the old document position. preventScroll so it
// doesn't fight Lenis or the hash-scroll handler.
document.addEventListener('astro:after-swap', () => {
  const main = document.getElementById('main');
  if (main && !location.hash) {
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }
});
