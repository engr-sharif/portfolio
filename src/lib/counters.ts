/**
 * Count-up metric animation. Any [data-count] element tweens from 0 to its
 * target when scrolled into view. Reduced-motion users see the final number
 * immediately (and the resting DOM value is the real number for SEO/AT).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function initCounters() {
  const els = gsap.utils.toArray<HTMLElement>('[data-count]');
  if (!els.length) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  els.forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const suffix = el.dataset.suffix ?? '';
    if (reduced) {
      el.textContent = `${target}${suffix}`;
      return;
    }
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.4,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => {
        el.textContent = `${Math.round(obj.v)}${suffix}`;
      },
    });
  });
}

document.addEventListener('astro:page-load', initCounters);
