/**
 * The work index: hovering a project that has a film floats its loop beside
 * the pointer, trailing it on a spring and leaning into the motion. Following
 * the link hands the clip on: it morphs (a view transition) into the film's
 * frame at the head of the project page, and the loop there carries on from
 * the same moment (scripts/loop.ts). Mouse only; never under reduced motion.
 */
import { handOff } from './loop';

interface Peek { loop: string; loopWebm?: string; poster: string; vt: string }

export function initPeek() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rows = [...document.querySelectorAll<HTMLAnchorElement>('a[data-peek]')];
  if (!rows.length) return;

  const box = document.createElement('div');
  box.className = 'peek';
  box.setAttribute('aria-hidden', 'true');
  const video = document.createElement('video');
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none' });
  box.append(video);
  document.body.append(box);

  let row: HTMLAnchorElement | null = null;
  let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
  const tick = () => {
    x += (tx - x) * 0.16;
    y += (ty - y) * 0.16;
    const lean = Math.max(-7, Math.min(7, (tx - x) * 0.05));
    box.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${lean}deg)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
  };
  /** Beside the pointer, on whichever side has room. */
  const aim = (cx: number, cy: number) => {
    const w = box.offsetWidth, h = box.offsetHeight, gap = 28;
    tx = cx + gap + w < innerWidth - 16 ? cx + gap : cx - gap - w;
    ty = Math.min(innerHeight - h - 16, Math.max(16, cy - h / 2));
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const show = (r: HTMLAnchorElement, e: PointerEvent) => {
    const p = JSON.parse(r.dataset.peek!) as Peek;
    if (row !== r) {
      video.poster = p.poster;
      video.replaceChildren(...[[p.loop, 'video/mp4'], [p.loopWebm, 'video/webm']].filter(([src]) => src).map(([src, type]) => Object.assign(document.createElement('source'), { src, type })));
      video.load();
    }
    if (!box.classList.contains('is-on')) {
      aim(e.clientX, e.clientY);
      x = tx; y = ty;   // appear at the pointer, not fly in from the last place
    }
    row = r;
    box.classList.add('is-on');
    video.play().catch(() => { /* the poster stands in */ });
  };
  const hide = () => {
    box.classList.remove('is-on');
    setTimeout(() => { if (!box.classList.contains('is-on')) video.pause(); }, 300);
  };

  rows.forEach((r) => {
    r.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(r, e); });
    r.addEventListener('pointerleave', hide);
    r.addEventListener('click', () => {
      if (row !== r || !box.classList.contains('is-on')) return;
      // the clip becomes the film's frame on the next page, still playing
      box.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      box.style.viewTransitionName = (JSON.parse(r.dataset.peek!) as Peek).vt;
      handOff([video]);
    });
  });
  addEventListener('pointermove', (e) => { if (box.classList.contains('is-on')) aim(e.clientX, e.clientY); }, { passive: true });
  // back from the project page: start clean
  addEventListener('pageshow', () => { box.style.viewTransitionName = ''; hide(); });
}
