/**
 * Short silent loops play only while on screen, and never under reduced
 * motion (the poster frame stands in). Saves battery and bandwidth.
 */
export function initLoops() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-loop]')];
  if (reduced) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) v.play().catch(() => { /* autoplay refused: poster stays */ });
      else v.pause();
    }
  }, { threshold: 0.25 });
  videos.forEach((v) => { v.muted = true; io.observe(v); });
}
