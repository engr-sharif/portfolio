/**
 * Per-post client behaviour: a reading-progress bar driven by Lenis (falls back
 * to native scroll) and a scroll-spy that highlights the active TOC link.
 * Re-binds on every astro:page-load; respects reduced motion implicitly (the
 * progress bar is orientation, not decoration, so it stays).
 */
function initProgress() {
  const bar = document.getElementById('read-progress');
  const article = document.querySelector<HTMLElement>('[data-post-body]');
  if (!bar || !article) return;

  const update = () => {
    const start = article.offsetTop;
    const end = start + article.offsetHeight - window.innerHeight;
    const p = (window.scrollY - start) / Math.max(1, end - start);
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  };

  if (window.__lenis) window.__lenis.on('scroll', update);
  else window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

function initScrollSpy() {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  if (!links.length) return;
  const map = new Map(links.map((l) => [l.dataset.tocLink, l]));
  const headings = [...document.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')];

  const obs = new IntersectionObserver(
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
  headings.forEach((h) => obs.observe(h));
}

document.addEventListener('astro:page-load', () => {
  initProgress();
  initScrollSpy();
});
