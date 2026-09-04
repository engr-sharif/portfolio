/**
 * Per-post client behaviour.
 *
 * Reading progress: pure CSS where scroll-driven animations exist (the bar is
 * scrubbed by the article's own view timeline — see global.css). Browsers
 * without them get this small scroll listener instead. The scroll-spy that
 * highlights the active TOC link is an IntersectionObserver either way.
 * Re-binds on every astro:page-load.
 */
let progressCleanup: (() => void) | null = null;

function initProgress() {
  progressCleanup?.();
  progressCleanup = null;
  if (CSS.supports?.('animation-timeline: view()')) return; // CSS handles it

  const bar = document.getElementById('read-progress');
  const article = document.querySelector<HTMLElement>('[data-post-body]');
  if (!bar || !article) return;

  let raf = 0;
  const update = () => {
    raf = 0;
    const start = article.offsetTop;
    const end = start + article.offsetHeight - window.innerHeight;
    const p = (window.scrollY - start) / Math.max(1, end - start);
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
  progressCleanup = () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (raf) cancelAnimationFrame(raf);
  };
}

let spy: IntersectionObserver | null = null;
function initScrollSpy() {
  spy?.disconnect();
  spy = null;
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  if (!links.length) return;
  const map = new Map(links.map((l) => [l.dataset.tocLink, l]));
  const headings = [...document.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')];

  spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.remove('is-active'));
          map.get(e.target.id)?.classList.add('is-active');
        }
      }
    },
    { rootMargin: '-10% 0px -75% 0px', threshold: 0 },
  );
  headings.forEach((h) => spy!.observe(h));
}

document.addEventListener('astro:page-load', () => {
  initProgress();
  initScrollSpy();
});
document.addEventListener('astro:before-swap', () => {
  progressCleanup?.();
  progressCleanup = null;
  spy?.disconnect();
  spy = null;
});
