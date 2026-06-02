/**
 * Hero scroll parallax. As you scroll the hero out of view:
 *  - the particle backdrop drifts slowly (moves less than the page → "behind"),
 *  - the headline/content drifts faster and fades (moves more → "in front"),
 * creating depth. Scrubbed to the scroll position via GSAP ScrollTrigger.
 *
 * Disabled under reduced motion and on touch (where heavy scroll effects feel
 * janky). Rebinds on every astro:page-load; its triggers are cleaned up by the
 * global astro:before-swap handler in motion.ts.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function initHeroParallax() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if (reduced || coarse) return;

  const bg = hero.querySelector<HTMLElement>('[data-hero-parallax="bg"]');
  const content = hero.querySelector<HTMLElement>('[data-hero-parallax="content"]');

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      scrub: 0.6,
    },
  });

  // Backdrop sinks slowly and dims a touch.
  if (bg) tl.to(bg, { yPercent: 14, opacity: 0.55, ease: 'none' }, 0);
  // Content lifts faster and fades — reads as floating in front.
  if (content) tl.to(content, { yPercent: -26, opacity: 0, ease: 'none' }, 0);
}

document.addEventListener('astro:page-load', initHeroParallax);
