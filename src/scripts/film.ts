/**
 * The cinema player for a project's film (components/media/Film.astro).
 * "Watch the film" grows the frame on the page into a full-screen cinema on a
 * spring, starts the full cut with sound, and puts it back when you close.
 * Controls: play/pause, a scrubber marked with the film's chapters (the
 * current chapter is named in the corner), sound, full screen. They step
 * aside while the film plays and come back on any movement.
 * Keyboard: Space/K play-pause, ←/→ five seconds, M sound, F full screen, Esc.
 *
 * A film with a storyboard previews the frame under the pointer over the
 * scrubber, and its chapter cards on the page (Film.astro) scrub through
 * their chapter as the pointer crosses them; a click grows the film out of
 * the card's still and starts it there. Closing part-way puts "Resume at"
 * on the page's play button.
 */
interface Storyboard { src: string; every: number; cols: number; rows: number; w: number; h: number }
interface Film { title: string; src: string; srcSmall?: string; webm?: string; poster: string; duration?: number; aspect?: number; chapters: { t: number; label: string }[]; storyboard?: Storyboard }

/** The storyboard tile for a moment, as a background-position. */
const tileAt = (sb: Storyboard, t: number) => {
  const i = Math.max(0, Math.min(sb.cols * sb.rows - 1, Math.floor(t / sb.every)));
  const pct = (k: number, n: number) => (n > 1 ? (k / (n - 1)) * 100 : 0);
  return `${pct(i % sb.cols, sb.cols)}% ${pct(Math.floor(i / sb.cols), sb.rows)}%`;
};

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const I = {
  play: '<path d="M5 3v10l8-5z" fill="currentColor"/>',
  pause: '<path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor"/>',
  sound: '<path d="M2.5 6h2.5L8.5 3v10L5 10H2.5z" fill="currentColor"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12 4a5.5 5.5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  mute: '<path d="M2.5 6h2.5L8.5 3v10L5 10H2.5z" fill="currentColor"/><path d="m10.5 6 4 4m0-4-4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  full: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  close: '<path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-width="1.5"/>',
};
const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export function initFilm() {
  const d = document.createElement('dialog');
  d.className = 'cin';
  d.setAttribute('aria-label', 'Film');
  d.innerHTML = `
    <div class="cin__bg" data-bg></div>
    <div class="cin__screen" data-screen><div class="cin__still" data-still></div><video class="cin__video" playsinline preload="auto" data-video></video></div>
    <header class="cin__top" data-ui>
      <p class="cin__title"><span data-title></span><span class="cin__chapter mono" data-chapter></span></p>
      <button class="cin__btn" type="button" data-close aria-label="Close the film">${icon(I.close)}</button>
    </header>
    <div class="cin__bar" data-ui>
      <button class="cin__btn" type="button" data-play aria-label="Pause">${icon(I.pause)}</button>
      <span class="cin__time mono" data-time>0:00</span>
      <div class="cin__scrub" data-scrub role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="cin__rail"><div class="cin__buf" data-buf></div><div class="cin__fill" data-fill></div></div>
        <div class="cin__ticks" data-ticks></div>
        <div class="cin__head" data-head></div>
        <div class="cin__tip mono" data-tip hidden><span class="cin__peek" data-peek hidden></span><span data-tipt></span></div>
      </div>
      <span class="cin__time mono" data-dur>0:00</span>
      <button class="cin__btn" type="button" data-sound aria-label="Mute">${icon(I.sound)}</button>
      <button class="cin__btn" type="button" data-full aria-label="Full screen">${icon(I.full)}</button>
    </div>`;
  document.body.append(d);
  const $ = <T extends Element>(s: string) => d.querySelector<T>(s)!;
  const video = $<HTMLVideoElement>('[data-video]');
  const screen = $<HTMLElement>('[data-screen]');
  const bg = $<HTMLElement>('[data-bg]');
  const ui = [...d.querySelectorAll<HTMLElement>('[data-ui]')];
  const playBtn = $<HTMLButtonElement>('[data-play]');
  const soundBtn = $<HTMLButtonElement>('[data-sound]');
  const scrub = $<HTMLElement>('[data-scrub]');
  const fillEl = $<HTMLElement>('[data-fill]');
  const bufEl = $<HTMLElement>('[data-buf]');
  const head = $<HTMLElement>('[data-head]');
  const tip = $<HTMLElement>('[data-tip]');
  const ticks = $<HTMLElement>('[data-ticks]');
  const chapterEl = $<HTMLElement>('[data-chapter]');
  const peek = $<HTMLElement>('[data-peek]');
  const stillEl = $<HTMLElement>('[data-still]');
  const tipText = $<HTMLElement>('[data-tipt]');

  let film: Film | null = null;
  /** hls.js, loaded only when a film streams as HLS and the browser can't play it natively. */
  let hls: { destroy(): void } | null = null;
  let loads = 0;
  const load = (src: string, at: number) => {
    hls?.destroy(); hls = null;
    const n = ++loads;
    if (!src.endsWith('.m3u8')) { video.src = at ? `${src}#t=${at}` : src; return; }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      if (at) video.addEventListener('loadedmetadata', () => { video.currentTime = at; }, { once: true });
      return;
    }
    import('hls.js/light').then(({ default: Hls }) => {
      if (n !== loads || !d.open) return;   // closed, or another film, while hls.js loaded
      if (!Hls.isSupported()) { const alt = film?.srcSmall || film?.webm; if (alt) video.src = alt; return; }
      const h = new Hls({ capLevelToPlayerSize: true, startLevel: -1, startPosition: at });
      h.loadSource(src);
      h.attachMedia(video);
      h.on(Hls.Events.MANIFEST_PARSED, () => video.play().then(setPlay).catch(() => setPlay()));
      hls = h;
    });
  };
  let origin: HTMLElement | null = null;
  let figure: HTMLElement | null = null;
  let trigger: HTMLElement | null = null;
  let chapter = -1;
  let idle = 0;

  /** The film fitted to the screen at 16:9, in pixels. */
  const fitScreen = () => {
    const pad = innerWidth > 720 ? 48 : 0;
    const w = Math.min(innerWidth - pad * 2, (innerHeight - pad * 2) * 16 / 9);
    const h = w * 9 / 16;
    Object.assign(screen.style, { width: `${w}px`, height: `${h}px`, left: `${(innerWidth - w) / 2}px`, top: `${(innerHeight - h) / 2}px` });
    // the chapter's still, over the picture area, until the film's first frame
    const a = film?.aspect ?? 16 / 9, pw = a >= 16 / 9 ? w : h * a;
    Object.assign(stillEl.style, { width: `${pw}px`, height: `${pw / a}px`, left: `${(w - pw) / 2}px`, top: `${(h - pw / a) / 2}px` });
    return screen.getBoundingClientRect();
  };
  /** The screen placed so its picture covers `el` (a frame, or a chapter's
   * still), clipped to it. A letterboxed film grows its picture, not its bars. */
  const fromEl = (el: HTMLElement, to: DOMRect): Keyframe => {
    const f = el.getBoundingClientRect();
    const a = film?.aspect ?? 16 / 9;
    const pw = a >= to.width / to.height ? to.width : to.height * a;
    const s = Math.max(f.width / pw, f.height / (pw / a));
    const tx = f.left + f.width / 2 - to.left - (s * to.width) / 2;
    const ty = f.top + f.height / 2 - to.top - (s * to.height) / 2;
    const ix = (to.width - f.width / s) / 2, iy = (to.height - f.height / s) / 2;
    const r = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) / s;
    return { transform: `translate3d(${tx}px, ${ty}px, 0) scale(${s})`, clipPath: `inset(${iy}px ${ix}px round ${r}px)` };
  };
  /** The screen in place, clipped to its picture: a letterboxed film's bars
   * stay out of the morph (after it they are black on black). */
  const whole = (to: DOMRect): Keyframe => {
    const a = film?.aspect ?? 16 / 9;
    const pw = a >= to.width / to.height ? to.width : to.height * a;
    return { transform: 'none', clipPath: `inset(${(to.height - pw / a) / 2}px ${(to.width - pw) / 2}px round 0px)` };
  };

  const showUI = () => {
    d.classList.remove('is-idle');
    clearTimeout(idle);
    if (!video.paused) idle = window.setTimeout(() => d.classList.add('is-idle'), 2600);
  };
  const setPlay = () => {
    const p = video.paused;
    playBtn.innerHTML = icon(p ? I.play : I.pause);
    playBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
    d.classList.toggle('is-paused', p);
    showUI();
  };
  const setSound = () => {
    soundBtn.innerHTML = icon(video.muted ? I.mute : I.sound);
    soundBtn.setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Mute');
  };
  const paintTime = () => {
    const t = video.currentTime, dur = video.duration || 0;
    const k = dur ? t / dur : 0;
    fillEl.style.transform = `scaleX(${k})`;
    head.style.left = `${k * 100}%`;
    $('[data-time]').textContent = clock(t);
    scrub.setAttribute('aria-valuenow', String(Math.round(k * 100)));
    scrub.setAttribute('aria-valuetext', `${clock(t)} of ${clock(dur)}`);
    if (video.buffered.length && dur) bufEl.style.transform = `scaleX(${video.buffered.end(video.buffered.length - 1) / dur})`;
    const chs = film?.chapters ?? [];
    let c = -1;
    chs.forEach((ch, i) => { if (t >= ch.t) c = i; });
    if (c !== chapter) {
      chapter = c;
      chapterEl.textContent = c >= 0 ? `${String(c + 1).padStart(2, '0')} · ${chs[c].label}` : '';
      if (!reduced() && c >= 0) chapterEl.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  };
  const buildTicks = () => {
    const dur = video.duration;
    ticks.innerHTML = dur && film ? film.chapters.filter((c) => c.t > 0.5).map((c) => `<i style="left:${(c.t / dur) * 100}%"></i>`).join('') : '';
    $('[data-dur]').textContent = clock(dur);
  };
  const seekAt = (clientX: number) => {
    const r = scrub.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (video.duration) video.currentTime = k * video.duration;
    paintTime();
  };

  const open = (btn: HTMLElement) => {
    figure = btn.closest<HTMLElement>('.film');
    const play = figure?.querySelector<HTMLElement>('[data-film]');
    if (!figure || !play) return;
    film = JSON.parse(play.dataset.film!) as Film;
    trigger = btn;
    // a chapter card grows the film out of its still and starts at its chapter
    const at = btn.dataset.filmAt != null ? Number(btn.dataset.filmAt) : Number(play.dataset.resume || 0);
    origin = (btn.dataset.filmAt != null && btn.querySelector<HTMLElement>('.film__still')) || figure.querySelector<HTMLElement>('.film__frame');
    const small = innerWidth < 900 || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const h264 = video.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') !== '';
    load(film.src.endsWith('.m3u8') ? film.src : !h264 && film.webm ? film.webm : (small && film.srcSmall) || film.src, at);
    // grown from a chapter card, the card's still carries on in the screen
    // until the film's first frame covers it; from the frame, the poster does
    const sb = film.storyboard;
    const card = btn.dataset.filmAt != null && sb ? btn.querySelector<HTMLElement>('.film__still') : null;
    Object.assign(stillEl.style, card ? { backgroundImage: `url(${sb!.src})`, backgroundSize: `${sb!.cols * 100}% ${sb!.rows * 100}%`, backgroundPosition: tileAt(sb!, Number(card.dataset.rest)) } : { backgroundImage: '' });
    if (card) video.removeAttribute('poster'); else video.poster = film.poster;
    video.muted = false;
    $('[data-title]').textContent = film.title;
    chapter = -1; chapterEl.textContent = '';
    document.querySelectorAll<HTMLVideoElement>('video[data-loop]').forEach((v) => v.pause());
    document.documentElement.classList.add('vw-open');
    d.showModal();
    const to = fitScreen();
    setSound();
    video.play().then(setPlay).catch(() => setPlay());
    if (reduced()) return;
    const ease = { duration: 820, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
    screen.animate([fromEl(origin!, to), whole(to)], ease);
    bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out', fill: 'backwards' });
    ui.forEach((el) => el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
  };

  let closing = false;
  const done = () => {
    closing = false;
    video.pause();
    hls?.destroy(); hls = null;
    video.removeAttribute('src'); video.load();
    if (d.open) d.close();
    document.documentElement.classList.remove('vw-open');
    screen.getAnimations().forEach((a) => a.cancel());
    [bg, ...ui].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    d.classList.remove('is-idle', 'is-paused');
    (trigger ?? origin?.querySelector('button'))?.focus({ preventScroll: true });
    document.querySelectorAll<HTMLVideoElement>('video[data-loop]').forEach((v) => { if (!reduced()) v.play().catch(() => {}); });
  };
  /** Left part-way: the page's play button offers to resume, and the chapter you were in is marked. */
  const remember = () => {
    const play = figure?.querySelector<HTMLElement>('[data-film]');
    const meta = figure?.querySelector<HTMLElement>('[data-film-meta]');
    if (!play || !meta) return;
    const t = video.currentTime, dur = video.duration || film?.duration || 0;
    meta.dataset.plain ??= meta.textContent ?? '';
    const part = t > 3 && dur - t > 3;
    play.dataset.resume = part ? String(Math.floor(t)) : '';
    meta.textContent = part ? `Resume at ${clock(t)}` : meta.dataset.plain;
    figure!.querySelectorAll<HTMLElement>('.film__ch').forEach((c) => {
      const here = part && t >= Number(c.dataset.filmAt) && t < Number(c.dataset.filmEnd);
      c.classList.toggle('is-here', here);
      if (here) c.closest('ol')?.scrollTo({ left: c.parentElement!.offsetLeft - 16, behavior: 'smooth' });
    });
  };
  const close = () => {
    if (closing || !d.open) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    video.pause();
    tip.hidden = true;
    remember();
    if (reduced() || !origin) { done(); return; }
    closing = true;
    const f = origin.getBoundingClientRect();
    if (f.bottom < 0 || f.top > innerHeight) origin.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const to = screen.getBoundingClientRect();
    [bg, ...ui].forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' }));
    const a = screen.animate([whole(to), fromEl(origin, to)], { duration: 560, easing: 'cubic-bezier(0.3, 0, 0.1, 1)', fill: 'forwards' });
    a.onfinish = done;
  };

  /* wiring */
  const toggle = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
  playBtn.addEventListener('click', toggle);
  screen.addEventListener('click', toggle);
  soundBtn.addEventListener('click', () => { video.muted = !video.muted; setSound(); });
  $('[data-full]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else (d.requestFullscreen?.() ?? Promise.reject()).catch(() => (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.());
  });
  $('[data-close]').addEventListener('click', close);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('pointermove', showUI);
  d.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { if ((e.target as Element).closest('button')) return; e.preventDefault(); toggle(); }
    else if (k === 'arrowright') { e.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); }
    else if (k === 'arrowleft') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
    else if (k === 'm') { video.muted = !video.muted; setSound(); }
    else if (k === 'f') $<HTMLButtonElement>('[data-full]').click();
    showUI();
  });
  video.addEventListener('play', setPlay);
  video.addEventListener('pause', setPlay);
  video.addEventListener('ended', setPlay);
  video.addEventListener('timeupdate', paintTime);
  video.addEventListener('progress', paintTime);
  video.addEventListener('loadedmetadata', () => { buildTicks(); paintTime(); });
  video.addEventListener('volumechange', setSound);

  let dragging = false;
  scrub.addEventListener('pointerdown', (e) => { dragging = true; scrub.setPointerCapture(e.pointerId); seekAt(e.clientX); });
  scrub.addEventListener('pointermove', (e) => {
    const r = scrub.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const t = k * (video.duration || 0);
    const ch = film?.chapters.filter((c) => c.t <= t).pop();
    tip.hidden = false;
    tipText.textContent = `${clock(t)}${ch ? ` · ${ch.label}` : ''}`;
    const sb = film?.storyboard;
    peek.hidden = !sb || (e.pointerType === 'touch' && !dragging);
    if (sb) Object.assign(peek.style, { backgroundImage: `url(${sb.src})`, backgroundSize: `${sb.cols * 100}% ${sb.rows * 100}%`, backgroundPosition: tileAt(sb, t), aspectRatio: `${sb.w} / ${sb.h}` });
    // keep the preview on screen at the ends of the bar
    const half = (sb ? peek.offsetWidth : tip.offsetWidth) / 2;
    tip.style.left = `${Math.min(r.width - half, Math.max(half, k * r.width))}px`;
    if (dragging) seekAt(e.clientX);
  });
  scrub.addEventListener('pointerleave', () => (tip.hidden = true));
  scrub.addEventListener('pointerup', () => (dragging = false));
  scrub.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); video.currentTime += e.key === 'ArrowRight' ? 5 : -5; }
  });
  addEventListener('resize', () => { if (d.open) fitScreen(); });

  document.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest<HTMLElement>('[data-film], [data-film-at]');
    if (!b || d.open) return;
    e.preventDefault();
    open(b);
  });

  // a chapter card scrubs through its chapter under a mouse
  document.querySelectorAll<HTMLElement>('.film__ch').forEach((card) => {
    const still = card.querySelector<HTMLElement>('.film__still');
    const cfg = card.closest('.film')?.querySelector<HTMLElement>('[data-film]')?.dataset.film;
    const sb = cfg ? (JSON.parse(cfg) as Film).storyboard : undefined;
    if (!still || !sb) return;
    const from = Number(card.dataset.filmAt), to = Number(card.dataset.filmEnd);
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = still.getBoundingClientRect();
      const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      still.style.backgroundPosition = tileAt(sb, from + k * Math.max(0, to - from - 0.01));
      card.style.setProperty('--k', String(k));
      card.classList.add('is-scrubbing');
    });
    card.addEventListener('pointerleave', () => {
      still.style.backgroundPosition = tileAt(sb, Number(still.dataset.rest));
      card.classList.remove('is-scrubbing');
    });
  });
}
