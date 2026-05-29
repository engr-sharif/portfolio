/**
 * Scroll-drawn career timeline: the accent line fills as the section scrolls
 * through the viewport. Communicates progression (structural motion, not
 * decoration). Under reduced-motion the line is simply shown fully drawn.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function initTimeline() {
  const el = document.querySelector<HTMLElement>('[data-timeline]');
  const progress = el?.querySelector<HTMLElement>('[data-timeline-progress]');
  if (!el || !progress) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.set(progress, { scaleY: 1 });
    return;
  }

  gsap.fromTo(
    progress,
    { scaleY: 0 },
    {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: el,
        start: 'top 75%',
        end: 'bottom 80%',
        scrub: 0.6,
      },
    },
  );
}

document.addEventListener('astro:page-load', initTimeline);
