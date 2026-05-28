/**
 * Pinned, scroll-driven horizontal showcase. The section pins while the user
 * scrolls; the flagship panels translate sideways and earlier panels fade and
 * shrink as they move away. On touch / small screens / reduced-motion we skip
 * the pin entirely and fall back to a native horizontal scroll-snap strip
 * (see .showcase__track media query) — no scroll-jacking on phones.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function initShowcase() {
  const section = document.querySelector<HTMLElement>('[data-showcase]');
  const track = section?.querySelector<HTMLElement>('.showcase__track');
  if (!section || !track) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = window.matchMedia('(max-width: 800px)').matches;
  if (reduced || small) return; // native horizontal scroll fallback

  const panels = gsap.utils.toArray<HTMLElement>('.showcase__panel');
  const distance = () => track.scrollWidth - window.innerWidth;

  const tween = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${distance()}`,
      pin: true,
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  // Earlier panels translate/fade away as they leave the viewport's left edge.
  panels.forEach((panel) => {
    gsap.fromTo(
      panel,
      { opacity: 1, scale: 1 },
      {
        opacity: 0.2,
        scale: 0.92,
        ease: 'none',
        scrollTrigger: {
          containerAnimation: tween,
          trigger: panel,
          start: 'left 8%',
          end: 'left -30%',
          scrub: true,
        },
      },
    );
  });
}

document.addEventListener('astro:page-load', initShowcase);
