/**
 * YouTube, click to load. The page shows only a poster and a play button; no
 * YouTube script, cookie or request happens until the reader presses play,
 * and then only the privacy-enhanced (youtube-nocookie) player loads.
 */
export function initYouTube() {
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-yt]');
    if (!el || el.dataset.playing) return;
    e.preventDefault();
    const id = el.dataset.yt!;
    const start = el.dataset.start ? `&start=${encodeURIComponent(el.dataset.start)}` : '';
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1${start}`;
    frame.title = el.dataset.title || 'Video';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    el.dataset.playing = '1';
    el.replaceChildren(frame);
    frame.focus();
  });
}
