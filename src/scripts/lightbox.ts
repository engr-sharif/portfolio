/**
 * The photo viewer. Any <button data-lightbox="group" data-src data-w data-h
 * data-caption data-no> opens it, and it steps through every figure in the
 * same group.
 *
 * - Opening, the photo grows out of its thumbnail: the frame morphs from the
 *   thumbnail's crop to the whole photo on a spring (transform + clip-path),
 *   while the page falls away behind a glow taken from the photo itself.
 * - Photos are laid out in pixels, fitted to the room the screen leaves
 *   (never by percentages of an auto-sized box), so nothing overflows.
 * - Next and previous slide over each other like a stack of prints; drag or
 *   flick with a finger, trackpad or mouse, and the stack follows the hand.
 * - Double-click / double-tap or pinch to zoom, drag to look around;
 *   drag down to put the photo back.
 * - Keyboard: arrows, Home/End, Esc. Reduced motion: short crossfades only.
 */
interface Item {
  full: string; w: number; h: number; thumb: string;
  alt: string; caption: string; no: string; pos: [number, number];
  trigger: HTMLElement;
}
type Rect = { left: number; top: number; width: number; height: number };

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A damped spring, sampled into a CSS linear() easing (falls back to an ease-out). */
function springEasing(k = 190, c = 23): { easing: string; duration: number } {
  let x = 0, v = 0, t = 0;
  const dt = 1 / 240, pts: number[] = [0];
  while (t < 2.5) {
    v += (-k * (x - 1) - c * v) * dt; x += v * dt; t += dt;
    pts.push(x);
    if (t > 0.25 && Math.abs(x - 1) < 0.0005 && Math.abs(v) < 0.005) break;
  }
  const n = 72, out: string[] = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))].toFixed(4));
  out[n - 1] = '1';
  const linear = `linear(${out.join(', ')})`;
  const ok = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  return ok ? { easing: linear, duration: Math.round(t * 1000) } : { easing: 'cubic-bezier(0.16, 1, 0.3, 1)', duration: 560 };
}

/** A spring stepped by hand each frame, so a drag can hand straight over to it. */
class Spring {
  x = 0; v = 0; target = 0;
  constructor(public k = 260, public c = 30) {}
  step(dt: number) {
    const a = -this.k * (this.x - this.target) - this.c * this.v;
    this.v += a * dt; this.x += this.v * dt;
    return Math.abs(this.x - this.target) < 0.4 && Math.abs(this.v) < 6;
  }
}

const ICON = {
  close: '<path d="m4 4 8 8m0-8-8 8"/>',
  prev: '<path d="M10 3 5 8l5 5"/>',
  next: '<path d="m6 3 5 5-5 5"/>',
};
const icon = (d: string) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${d}</svg>`;

export function initLightbox() {
  const dialog = document.createElement('dialog');
  dialog.className = 'vw';
  dialog.setAttribute('aria-label', 'Photo viewer');
  dialog.innerHTML = `
    <div class="vw__bg" data-bg aria-hidden="true">
      <img class="vw__glow" alt="" data-glow /><img class="vw__glow" alt="" data-glow />
    </div>
    <header class="vw__top" data-chrome>
      <p class="vw__where"><span class="vw__no" data-no></span><span class="vw__count" data-count></span></p>
      <button class="vw__btn" type="button" data-close aria-label="Close viewer">${icon(ICON.close)}</button>
    </header>
    <div class="vw__stage" data-stage>
      <div class="vw__slide" data-slide><div class="vw__zoom"><img class="vw__lo" alt="" /><img class="vw__hi" alt="" /></div></div>
      <div class="vw__slide" data-slide><div class="vw__zoom"><img class="vw__lo" alt="" /><img class="vw__hi" alt="" /></div></div>
      <div class="vw__slide" data-slide><div class="vw__zoom"><img class="vw__lo" alt="" /><img class="vw__hi" alt="" /></div></div>
      <button class="vw__btn vw__arrow vw__arrow--prev" type="button" data-prev aria-label="Previous photo" data-chrome>${icon(ICON.prev)}</button>
      <button class="vw__btn vw__arrow vw__arrow--next" type="button" data-next aria-label="Next photo" data-chrome>${icon(ICON.next)}</button>
    </div>
    <footer class="vw__foot" data-chrome>
      <p class="vw__cap" data-cap aria-live="polite"></p>
      <div class="vw__strip" data-strip></div>
    </footer>`;
  document.body.append(dialog);

  const $ = <T extends Element>(s: string) => dialog.querySelector<T>(s)!;
  const stage = $<HTMLElement>('[data-stage]');
  const bg = $<HTMLElement>('[data-bg]');
  const glows = [...dialog.querySelectorAll<HTMLImageElement>('[data-glow]')];
  const cap = $<HTMLElement>('[data-cap]');
  const noEl = $<HTMLElement>('[data-no]');
  const countEl = $<HTMLElement>('[data-count]');
  const strip = $<HTMLElement>('[data-strip]');
  const prevBtn = $<HTMLButtonElement>('[data-prev]');
  const nextBtn = $<HTMLButtonElement>('[data-next]');
  const chrome = [...dialog.querySelectorAll<HTMLElement>('[data-chrome]')];
  /** slides[0] = previous, [1] = current, [2] = next; they rotate as you move. */
  let slides = [...dialog.querySelectorAll<HTMLElement>('[data-slide]')];

  let items: Item[] = [];
  let at = 0;
  let glowAt = 0;
  let tx = 0;                       // the stack's horizontal offset, px
  let W = 0;                        // one step of the stack: stage width + gap
  let busy = false;                 // an open/close morph is running
  let raf = 0;
  const track = new Spring();
  const zoom = { z: 1, x: 0, y: 0 };
  const SPRING = springEasing();

  /* ------------------------------------------------------------ layout */
  const stageBox = () => stage.getBoundingClientRect();
  /** The photo fitted into the room the stage leaves, in stage coordinates. */
  const fit = (it: Item): Rect => {
    const r = stageBox();
    const wide = r.width > 720;
    const padX = wide ? 88 : 10, padY = wide ? 12 : 6;
    const aw = Math.max(40, r.width - padX * 2), ah = Math.max(40, r.height - padY * 2);
    const s = Math.min(aw / it.w, ah / it.h);
    const width = Math.round(it.w * s), height = Math.round(it.h * s);
    return { left: Math.round((r.width - width) / 2), top: Math.round((r.height - height) / 2), width, height };
  };
  const inView = (r: Rect): Rect => { const s = stageBox(); return { left: s.left + r.left, top: s.top + r.top, width: r.width, height: r.height }; };

  const fill = (slide: HTMLElement, i: number) => {
    const it = items[i];
    slide.dataset.i = it ? String(i) : '';
    slide.hidden = !it;
    if (!it) return;
    const [lo, hi] = slide.querySelectorAll('img');
    const f = fit(it);
    Object.assign(slide.style, { left: `${f.left}px`, top: `${f.top}px`, width: `${f.width}px`, height: `${f.height}px` });
    if (lo.getAttribute('src') !== it.thumb) lo.src = it.thumb;
    if (hi.dataset.src !== it.full) {
      hi.classList.remove('is-in');
      hi.dataset.src = it.full;
      hi.onload = () => hi.classList.add('is-in');
      hi.src = it.full;
      if (hi.complete && hi.naturalWidth) hi.classList.add('is-in');
    }
    hi.alt = it.alt;
  };

  /** Place the three slides for the current offset: the stack of prints. */
  const paint = () => {
    const rm = reduced();
    slides.forEach((s, k) => {
      if (s.hidden) return;
      const p = ((k - 1) * W + tx) / (W || 1);          // -1 … 0 … 1: where this print sits
      let x = (k - 1) * W + tx, sc = 1, o = 1;
      if (p < 0 && !rm) {                                // the one underneath lags behind and sinks
        x -= p * W * 0.72;
        sc = 1 + p * 0.1;
        o = clamp(1 + p * 1.25, 0, 1);                  // gone before it is fully under
      }
      s.style.transform = `translate3d(${x.toFixed(1)}px,0,0) scale(${sc.toFixed(4)})`;
      s.style.opacity = String(o);
      s.style.visibility = o < 0.01 ? 'hidden' : '';
      s.style.zIndex = String(p < 0 ? 1 : 2 + k);
      s.setAttribute('aria-hidden', k === 1 ? 'false' : 'true');
    });
  };

  const layout = () => {
    W = stageBox().width + 32;
    fill(slides[0], at - 1); fill(slides[1], at); fill(slides[2], at + 1);
    applyZoom(false);
    paint();
  };

  /* ------------------------------------------------------------ chrome */
  const setGlow = (it: Item, instant = false) => {
    const next = glows[1 - glowAt];
    next.src = it.thumb;
    if (instant) next.style.transition = 'none';
    next.classList.add('is-on'); glows[glowAt].classList.remove('is-on');
    if (instant) requestAnimationFrame(() => (next.style.transition = ''));
    glowAt = 1 - glowAt;
  };
  const setText = (animate: boolean) => {
    const it = items[at];
    noEl.textContent = it.no;
    countEl.textContent = `${String(at + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    cap.textContent = it.caption;
    cap.hidden = !it.caption;
    if (animate && !reduced()) cap.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    prevBtn.disabled = at === 0;
    nextBtn.disabled = at === items.length - 1;
    prevBtn.hidden = nextBtn.hidden = items.length < 2;
    strip.querySelectorAll<HTMLElement>('button').forEach((b, i) => {
      const on = i === at;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-current', on ? 'true' : 'false');
      if (on) strip.scrollTo({ left: b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2, behavior: reduced() ? 'auto' : 'smooth' });
    });
  };
  const buildStrip = () => {
    strip.hidden = items.length < 2;
    strip.innerHTML = items.map((it, i) => `<button type="button" class="vw__thumb" aria-label="Photo ${i + 1}${it.caption ? `: ${it.caption.replace(/"/g, '&quot;')}` : ''}"><img alt="" src="${it.thumb}" loading="lazy" /></button>`).join('');
    strip.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => go(i)));
  };
  const preload = () => [at - 1, at + 1, at + 2].forEach((i) => { if (items[i]) new Image().src = items[i].full; });

  /* ------------------------------------------------------------ moving */
  const loop = (step: (dt: number) => boolean) => {
    cancelAnimationFrame(raf);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - last) / 1000); last = now;
      if (!step(dt)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  /** What to do when the stack comes to rest (a move to commit), if anything. */
  let settled: (() => void) | null = null;
  /** Settle the stack onto a target offset (−W next, 0 stay, +W previous). */
  const settle = (target: number, then?: () => void) => {
    settled = then ?? null;
    const done = () => { const f = settled; settled = null; f?.(); };
    if (reduced()) { tx = target; paint(); done(); return; }
    track.x = tx; track.target = target;
    loop((dt) => {
      const rest = track.step(dt);
      tx = rest ? target : track.x;
      paint();
      if (rest) done();
      return rest;
    });
  };
  /** Finish a move that is still in flight, so the next one starts from a clean stack. */
  const flush = () => {
    if (!settled) return;
    cancelAnimationFrame(raf);
    const f = settled; settled = null; f();
  };

  /** Rotate the slides once the stack has moved a whole step. */
  const commit = (dir: 1 | -1, to = at + dir) => {
    at = to;
    slides = dir > 0 ? [slides[1], slides[2], slides[0]] : [slides[2], slides[0], slides[1]];
    tx = 0;
    fill(slides[0], at - 1); fill(slides[1], at); fill(slides[2], at + 1);
    resetZoom(false);
    paint();
    setText(true);
    setGlow(items[at]);
    preload();
  };

  const go = (to: number) => {
    if (busy) return;
    flush();
    to = clamp(to, 0, items.length - 1);
    if (to === at) return;
    const dir: 1 | -1 = to > at ? 1 : -1;
    fill(slides[dir > 0 ? 2 : 0], to);
    if (reduced()) {
      commit(dir, to);
      slides[1].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      return;
    }
    track.v = 0;
    settle(-dir * W, () => commit(dir, to));
  };
  /** Step relative to wherever the stack will be once any move in flight lands. */
  const step = (d: number) => { if (busy) return; flush(); go(at + d); };

  /* ------------------------------------------------------------ zoom */
  const zoomEl = () => slides[1].querySelector<HTMLElement>('.vw__zoom')!;
  /** How far a zoomed photo can move before one of its edges comes inside the screen. */
  const clampPan = () => {
    const r = stageBox(), s = slides[1];
    const mx = Math.max(0, (s.offsetWidth * zoom.z - r.width) / 2);
    const my = Math.max(0, (s.offsetHeight * zoom.z - r.height) / 2);
    zoom.x = clamp(zoom.x, -mx, mx); zoom.y = clamp(zoom.y, -my, my);
  };
  const applyZoom = (animate: boolean) => {
    const el = zoomEl();
    const t = `translate3d(${zoom.x.toFixed(1)}px, ${zoom.y.toFixed(1)}px, 0) scale(${zoom.z.toFixed(4)})`;
    if (animate && !reduced()) el.animate([{ transform: getComputedStyle(el).transform }, { transform: t }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    el.style.transform = t;
    dialog.classList.toggle('is-zoomed', zoom.z > 1.01);
  };
  const resetZoom = (animate: boolean) => { zoom.z = 1; zoom.x = 0; zoom.y = 0; slides.forEach((s) => (s.querySelector<HTMLElement>('.vw__zoom')!.style.transform = '')); applyZoom(animate); };
  /** Zoom to `z` keeping the point under (cx, cy) where it is. */
  const zoomAt = (z: number, cx: number, cy: number, animate: boolean) => {
    const s = slides[1].getBoundingClientRect();
    const ox = cx - (s.left + s.width / 2), oy = cy - (s.top + s.height / 2);   // from the slide's centre, on screen
    const k = z / zoom.z;
    zoom.x = ox - (ox - zoom.x) * k; zoom.y = oy - (oy - zoom.y) * k;
    zoom.z = z;
    if (z <= 1.01) { zoom.z = 1; zoom.x = 0; zoom.y = 0; }
    clampPan();
    applyZoom(animate);
  };
  const toggleZoom = (cx: number, cy: number) => {
    if (zoom.z > 1.01) { resetZoom(true); return; }
    const it = items[at], s = slides[1];
    const native = it.w / s.offsetWidth;                     // 1:1 with the full image
    zoomAt(clamp(native, 2, 3.5), cx, cy, true);
  };

  /* ------------------------------------------------------------ open / close */
  /** Where the photo sits inside its thumbnail's frame (object-fit: cover). */
  const coverFrom = (it: Item, target: Rect) => {
    const frame = it.trigger.getBoundingClientRect();
    const s = Math.max(frame.width / target.width, frame.height / target.height);
    const w = target.width * s, h = target.height * s;
    const left = frame.left + (frame.width - w) * it.pos[0];
    const top = frame.top + (frame.height - h) * it.pos[1];
    const inset = [
      (frame.top - top) / s, (left + w - frame.right) / s,
      (top + h - frame.bottom) / s, (frame.left - left) / s,
    ].map((v) => `${Math.max(0, v).toFixed(1)}px`).join(' ');
    return {
      transform: `translate3d(${(left - target.left).toFixed(1)}px, ${(top - target.top).toFixed(1)}px, 0) scale(${s.toFixed(4)})`,
      clip: `inset(${inset})`,
      visible: frame.bottom > 0 && frame.top < innerHeight && frame.width > 0,
    };
  };
  const hideThumb = (it: Item | undefined, hide: boolean) => { const img = it?.trigger.querySelector('img'); if (img) img.style.opacity = hide ? '0' : ''; };
  const fadeChrome = (show: boolean, delay = 0) => {
    const kf = [{ opacity: 0 }, { opacity: 1 }];
    // showing hands back to the stylesheet when done (so drags can dim it); hiding holds until close
    [bg, ...chrome].forEach((el, i) => el.animate(show ? kf : [...kf].reverse(), {
      duration: show ? (i ? 420 : 380) : 260, delay: show && i ? delay : 0, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: show ? 'backwards' : 'forwards',
    }));
  };

  const open = (trigger: HTMLElement) => {
    const group = trigger.dataset.lightbox || 'default';
    const triggers = [...document.querySelectorAll<HTMLElement>(`[data-lightbox="${CSS.escape(group)}"]`)];
    items = triggers.map((t) => {
      const img = t.querySelector('img');
      const pos = (img ? getComputedStyle(img).objectPosition : '50% 50%').split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      return {
        full: t.dataset.src || img?.currentSrc || img?.src || '',
        w: Number(t.dataset.w) || img?.naturalWidth || 1600,
        h: Number(t.dataset.h) || img?.naturalHeight || 1200,
        thumb: img?.currentSrc || img?.src || t.dataset.src || '',
        alt: img?.alt ?? '',
        caption: t.dataset.caption ?? '',
        no: t.dataset.no ?? '',
        pos: [pos[0] ?? 0.5, pos[1] ?? 0.5],
        trigger: t,
      };
    });
    at = Math.max(0, triggers.indexOf(trigger));
    tx = 0;
    document.documentElement.classList.add('vw-open');
    dialog.showModal();
    buildStrip();
    layout();
    setText(false);
    setGlow(items[at], true);
    preload();

    const it = items[at];
    if (reduced()) { fadeChrome(true); return; }
    const from = coverFrom(it, inView(fit(it)));
    if (!from.visible) { fadeChrome(true); slides[1].animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); return; }
    busy = true;
    hideThumb(it, true);
    slides[0].style.visibility = slides[2].style.visibility = 'hidden';
    fadeChrome(true, 140);
    const a = slides[1].animate(
      [{ transform: from.transform, clipPath: from.clip }, { transform: 'translate3d(0,0,0) scale(1)', clipPath: 'inset(0px 0px 0px 0px)' }],
      { duration: SPRING.duration, easing: SPRING.easing },
    );
    a.onfinish = a.oncancel = () => { busy = false; slides[0].style.visibility = slides[2].style.visibility = ''; paint(); hideThumb(it, false); };
  };

  const finish = () => {
    cancelAnimationFrame(raf);
    dialog.classList.remove('is-dragging', 'is-zoomed', 'is-bare');
    [bg, ...chrome].forEach((el) => el.getAnimations().forEach((x) => x.cancel()));
    bg.style.opacity = ''; chrome.forEach((el) => (el.style.opacity = ''));
    slides.forEach((s) => { s.getAnimations().forEach((x) => x.cancel()); s.style.transform = ''; s.style.opacity = ''; });
    items.forEach((it) => hideThumb(it, false));
    if (dialog.open) dialog.close();
    document.documentElement.classList.remove('vw-open');
  };

  const close = () => {
    if (busy || !dialog.open) return;
    const it = items[at];
    if (!it || reduced()) { finish(); it?.trigger.focus({ preventScroll: true }); return; }
    // bring the thumbnail into view behind the viewer, so the photo has somewhere to go back to
    const fr = it.trigger.getBoundingClientRect();
    if (fr.bottom < 0 || fr.top > innerHeight) it.trigger.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    resetZoom(false);
    const slide = slides[1];
    const now = getComputedStyle(slide).transform;
    slide.style.transform = ''; slide.style.opacity = '1';
    const to = coverFrom(it, inView(fit(it)));
    busy = true;
    fadeChrome(false);
    slides[0].style.visibility = slides[2].style.visibility = 'hidden';
    if (!to.visible) {
      const a = slide.animate([{ transform: now, opacity: 1 }, { transform: 'scale(0.94)', opacity: 0 }], { duration: 240, easing: 'ease-in' });
      a.onfinish = () => { busy = false; slides[0].style.visibility = slides[2].style.visibility = ''; finish(); it.trigger.focus({ preventScroll: true }); };
      return;
    }
    hideThumb(it, true);
    const a = slide.animate(
      [{ transform: now === 'none' ? 'translate3d(0,0,0) scale(1)' : now, clipPath: 'inset(0px 0px 0px 0px)' }, { transform: to.transform, clipPath: to.clip }],
      { duration: Math.round(SPRING.duration * 0.62), easing: 'cubic-bezier(0.3, 0, 0.1, 1)', fill: 'forwards' },
    );
    a.onfinish = () => { busy = false; slides[0].style.visibility = slides[2].style.visibility = ''; finish(); it.trigger.focus({ preventScroll: true }); };
  };

  /* ------------------------------------------------------------ gestures */
  const pts = new Map<number, { x: number; y: number }>();
  let g: null | {
    x0: number; y0: number; t0: number; tx0: number; axis: '' | 'x' | 'y' | 'pan' | 'pinch';
    zx0: number; zy0: number; z0: number; d0: number; hist: { t: number; x: number; y: number }[];
  } = null;
  let lastTap = 0;

  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

  stage.addEventListener('pointerdown', (e) => {
    if (busy || (e.target as Element).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(raf);
    if (pts.size === 2) {
      g = { x0: mid().x, y0: mid().y, t0: performance.now(), tx0: tx, axis: 'pinch', zx0: zoom.x, zy0: zoom.y, z0: zoom.z, d0: dist(), hist: [] };
      return;
    }
    g = { x0: e.clientX, y0: e.clientY, t0: performance.now(), tx0: tx, axis: zoom.z > 1.01 ? 'pan' : '', zx0: zoom.x, zy0: zoom.y, z0: zoom.z, d0: 0, hist: [{ t: performance.now(), x: e.clientX, y: e.clientY }] };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!g || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.axis === 'pinch' && pts.size === 2) {
      const m = mid();
      const z = clamp(g.z0 * (dist() / g.d0), 1, 5);
      zoom.z = g.z0; zoom.x = g.zx0 + (m.x - g.x0); zoom.y = g.zy0 + (m.y - g.y0);
      zoomAt(z, m.x, m.y, false);
      return;
    }
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    g.hist.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (g.hist.length > 6) g.hist.shift();
    if (g.axis === 'pan') { zoom.x = g.zx0 + dx; zoom.y = g.zy0 + dy; clampPan(); applyZoom(false); return; }
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      dialog.classList.add('is-dragging');
    }
    if (g.axis === 'x') {
      let t = g.tx0 + dx;
      if ((at === 0 && t > 0) || (at === items.length - 1 && t < 0)) t *= 0.32;   // rubber band at the ends
      tx = t; paint();
    } else {
      const k = clamp(Math.abs(dy) / 420, 0, 1);
      slides[1].style.transform = `translate3d(${(dx * 0.35).toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${(1 - k * 0.22).toFixed(4)})`;
      bg.style.opacity = String(1 - k * 0.9);
      chrome.forEach((el) => (el.style.opacity = String(1 - k * 2)));
    }
  });

  const release = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.axis === 'pinch') { if (pts.size === 0) { g = null; if (zoom.z < 1.05) resetZoom(true); } return; }
    const gg = g; g = null;
    dialog.classList.remove('is-dragging');
    const h = gg.hist, a = h[0], b = h[h.length - 1];
    const vt = Math.max(1, b.t - a.t);
    const vx = (b.x - a.x) / vt, vy = (b.y - a.y) / vt;      // px per ms
    const dx = e.clientX - gg.x0, dy = e.clientY - gg.y0;

    if (!gg.axis || (gg.axis === 'pan' && Math.hypot(dx, dy) < 8)) {   // a tap
      // the stage holds the pointer capture, so hit-test the photo by position
      const r = slides[1].getBoundingClientRect();
      const onPhoto = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const now = performance.now();
      if (now - lastTap < 300) { lastTap = 0; if (onPhoto) toggleZoom(e.clientX, e.clientY); return; }
      lastTap = now;
      if (!onPhoto && e.pointerType === 'mouse') { close(); return; }
      if (e.pointerType !== 'mouse') setTimeout(() => { if (lastTap === now) dialog.classList.toggle('is-bare'); }, 300);
      return;
    }
    if (gg.axis === 'pan') return;
    if (gg.axis === 'y') {
      if (Math.abs(dy) > 110 || Math.abs(vy) > 0.6) { close(); return; }
      const s = slides[1], from = s.style.transform;
      s.style.transform = ''; bg.style.opacity = ''; chrome.forEach((el) => (el.style.opacity = ''));
      if (!reduced()) s.animate([{ transform: from }, { transform: 'translate3d(0,0,0) scale(1)' }], { duration: SPRING.duration, easing: SPRING.easing });
      paint();
      return;
    }
    // horizontal: flick or drag far enough → move; otherwise spring back
    const want = tx < -W * 0.18 || vx < -0.45 ? 1 : tx > W * 0.18 || vx > 0.45 ? -1 : 0;
    const ok = want === 1 ? at < items.length - 1 : want === -1 ? at > 0 : false;
    if (!ok) { settle(0); return; }
    fill(slides[want > 0 ? 2 : 0], at + want);
    track.v = vx * 1000;
    settle(-want * W, () => commit(want as 1 | -1));
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener('dblclick', (e) => { if ((e.target as Element).closest('.vw__slide')) { e.preventDefault(); } });
  stage.addEventListener('wheel', (e) => {
    if (!dialog.open || busy) return;
    if (e.ctrlKey || zoom.z > 1.01) {                        // trackpad pinch, or looking around a zoomed photo
      e.preventDefault();
      if (e.ctrlKey) zoomAt(clamp(zoom.z * Math.exp(-e.deltaY * 0.01), 1, 5), e.clientX, e.clientY, false);
      else { zoom.x -= e.deltaX; zoom.y -= e.deltaY; clampPan(); applyZoom(false); }
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 24 && !wheelLock) {
      e.preventDefault();
      wheelLock = true; setTimeout(() => (wheelLock = false), 520);
      step(e.deltaX > 0 ? 1 : -1);
    }
  }, { passive: false });
  let wheelLock = false;

  /* ------------------------------------------------------------ wiring */
  $('[data-close]').addEventListener('click', close);
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });   // Esc morphs back too
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(items.length - 1); }
  });
  addEventListener('resize', () => { if (dialog.open) { resetZoom(false); layout(); } });

  document.addEventListener('click', (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-lightbox]');
    if (!t || dialog.open) return;
    e.preventDefault();
    open(t);
  });
}
