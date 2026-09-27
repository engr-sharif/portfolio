/**
 * Voice notes and audio: a play button, a waveform you can scrub, and the
 * time. Markup (src/components/media/Audio.astro):
 *   <div data-audio data-src="…" data-peaks="12,40,…">  (peaks optional)
 * Peaks are computed by the Studio at upload; when missing they're decoded
 * here once the player scrolls into view. The waveform fills in cinnabar as it
 * plays. Keyboard: the waveform is a slider (←/→ seek 5 s, Space plays).
 */
const BARS = 96;

function css(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

async function decodePeaks(src: string): Promise<number[]> {
  const buf = await (await fetch(src)).arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const audio = await ctx.decodeAudioData(buf);
  ctx.close();
  const data = audio.getChannelData(0);
  const size = Math.floor(data.length / BARS);
  const peaks: number[] = [];
  for (let i = 0; i < BARS; i++) {
    let max = 0;
    for (let j = i * size; j < (i + 1) * size; j += 16) max = Math.max(max, Math.abs(data[j]));
    peaks.push(max);
  }
  const top = Math.max(...peaks) || 1;
  return peaks.map((p) => p / top);
}

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export function initAudio() {
  document.querySelectorAll<HTMLElement>('[data-audio]').forEach((root) => {
    const src = root.dataset.src!;
    const btn = root.querySelector<HTMLButtonElement>('[data-audio-btn]')!;
    const wave = root.querySelector<HTMLElement>('[data-audio-wave]')!;
    const canvas = wave.querySelector('canvas')!;
    const time = root.querySelector<HTMLElement>('[data-audio-time]')!;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    let peaks: number[] = (root.dataset.peaks || '').split(',').map(Number).filter((n) => Number.isFinite(n)).map((n) => n / 255);

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const g = canvas.getContext('2d')!;
      g.scale(dpr, dpr);
      const n = peaks.length || BARS;
      const bw = w / n;
      const played = audio.duration ? audio.currentTime / audio.duration : 0;
      const ink = css('--rule-2'), hot = css('--cinnabar');
      for (let i = 0; i < n; i++) {
        const v = peaks.length ? Math.max(0.06, peaks[i]) : 0.06;
        const bh = v * h;
        g.fillStyle = i / n < played ? hot : ink;
        g.fillRect(i * bw + bw * 0.2, (h - bh) / 2, Math.max(1, bw * 0.6), bh);
      }
    };
    const tick = () => {
      time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
      wave.setAttribute('aria-valuenow', String(Math.round(audio.currentTime)));
      wave.setAttribute('aria-valuetext', `${fmt(audio.currentTime)} of ${fmt(audio.duration)}`);
      draw();
    };
    let raf = 0;
    const loop = () => { tick(); if (!audio.paused) raf = requestAnimationFrame(loop); };
    const setIcon = (playing: boolean) => {
      btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      btn.innerHTML = playing
        ? '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11"/><rect x="9.5" y="2.5" width="3" height="11"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
    };
    btn.addEventListener('click', () => { if (audio.paused) audio.play(); else audio.pause(); });
    audio.addEventListener('play', () => { setIcon(true); cancelAnimationFrame(raf); loop(); });
    audio.addEventListener('pause', () => { setIcon(false); tick(); });
    audio.addEventListener('ended', () => { setIcon(false); tick(); });
    audio.addEventListener('loadedmetadata', () => { wave.setAttribute('aria-valuemax', String(Math.round(audio.duration))); tick(); });

    const seekTo = (clientX: number) => {
      const r = wave.getBoundingClientRect();
      if (!audio.duration) return;
      audio.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * audio.duration;
      tick();
    };
    wave.addEventListener('pointerdown', (e) => { wave.setPointerCapture(e.pointerId); seekTo(e.clientX); });
    wave.addEventListener('pointermove', (e) => { if (wave.hasPointerCapture(e.pointerId)) seekTo(e.clientX); });
    wave.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); tick(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); tick(); e.preventDefault(); }
      else if (e.key === ' ' || e.key === 'Enter') { btn.click(); e.preventDefault(); }
    });
    window.addEventListener('themechange', draw);
    new ResizeObserver(draw).observe(wave);

    if (!peaks.length) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        decodePeaks(src).then((p) => { peaks = p; draw(); }).catch(() => { /* flat line stays */ });
      });
      io.observe(root);
    }
    setIcon(false);
    tick();
  });
}
