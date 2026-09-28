/**
 * Short silent loops play only while on screen, and never under reduced
 * motion (the poster frame stands in). Saves battery and bandwidth.
 *
 * A loop also carries on across pages: following a link remembers where each
 * playing loop was, and the same loop on the next page (the film's loop on
 * the home page's card and at the head of the project page) picks up from
 * that moment, so the picture that morphs between the pages keeps moving.
 */
const KEY = 'loop-handoff';
const pathOf = (v: HTMLVideoElement) => { try { return new URL(v.currentSrc || v.src, location.href).pathname; } catch { return ''; } };

export function initLoops() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-loop]')];
  if (reduced) return;

  // where to start: a loop left playing on the page before, within a few seconds
  let handoff: { at: number; t: Record<string, number> } | null = null;
  try { handoff = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch { /* storage off: start at 0 */ }
  const fresh = handoff && Date.now() - handoff.at < 8000 ? handoff : null;
  const resume = (v: HTMLVideoElement) => {
    const t = fresh?.t[pathOf(v)];
    if (t == null) return;
    const seek = () => { if (v.duration) v.currentTime = (t + (Date.now() - fresh!.at) / 1000) % v.duration; };
    if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(() => { /* autoplay refused: poster stays */ }); }
      else v.pause();
    }
  }, { threshold: 0.06 });  // a sliver is enough: a film's loop keeps moving as it arrives from the home page
  videos.forEach((v) => { v.muted = true; resume(v); io.observe(v); });

  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest('a[href]');
    if (!a) return;
    const t: Record<string, number> = {};
    videos.forEach((v) => { if (!v.paused && v.currentTime > 0) t[pathOf(v)] = v.currentTime; });
    if (!Object.keys(t).length) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), t })); } catch { /* fine */ }
  }, { capture: true });
}
