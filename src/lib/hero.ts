/**
 * Hero headline reveal — the site's signature move.
 * GSAP SplitText splits [data-hero-title] into lines, masks them, and reveals
 * line-by-line on load with a staggered eased entrance. Reduced-motion users
 * get the text shown instantly (no split, no transform).
 */
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

function revealHero() {
  const title = document.querySelector<HTMLElement>('[data-hero-title]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Always reveal the elements (they start at opacity:0 to avoid FOUC).
  const fadeIns = gsap.utils.toArray<HTMLElement>('[data-hero-fade]');

  if (!title) {
    gsap.set(fadeIns, { opacity: 1, y: 0 });
    return;
  }

  if (reduced) {
    gsap.set([title, ...fadeIns], { opacity: 1, y: 0 });
    return;
  }

  // Wait for fonts so line-splitting measures correctly.
  const run = () => {
    const split = new SplitText(title, {
      type: 'lines',
      linesClass: 'split-line-inner',
      mask: 'lines',
    });
    gsap.set(title, { opacity: 1 });

    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.from(split.lines, {
      yPercent: 115,
      duration: 1.1,
      stagger: 0.12,
    }).fromTo(
      fadeIns,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.9, stagger: 0.1 },
      '-=0.7',
    );
  };

  // Safety net: if anything throws or fonts never resolve, ensure the
  // eyebrow / subhead / buttons are visible rather than stuck at opacity 0.
  const failsafe = setTimeout(() => gsap.set(fadeIns, { opacity: 1, y: 0 }), 2500);
  const guardedRun = () => {
    try {
      run();
    } catch {
      gsap.set([title, ...fadeIns], { opacity: 1, y: 0 });
    } finally {
      clearTimeout(failsafe);
    }
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(guardedRun);
  } else {
    guardedRun();
  }
}
// (single astro:page-load listener registered at the bottom)

/**
 * Hero status rotator: cycle the "NOW →" instrument readout through its lines.
 * Pauses under reduced motion (shows the first line only).
 */
function startStatusRotator() {
  const el = document.querySelector<HTMLElement>('[data-status-lines]');
  if (!el || el.dataset.rotating) return;
  el.dataset.rotating = '1';

  let lines: string[] = [];
  try {
    lines = JSON.parse(el.dataset.statusLines || '[]');
  } catch {
    return;
  }
  if (lines.length < 2) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let i = 0;
  setInterval(() => {
    el.classList.add('is-swapping');
    setTimeout(() => {
      i = (i + 1) % lines.length;
      el.textContent = lines[i];
      el.classList.remove('is-swapping');
    }, 400);
  }, 3600);
}

document.addEventListener('astro:page-load', () => {
  revealHero();
  startStatusRotator();
});
