/**
 * The terrain: California as a point cloud on real elevation (SRTM-derived
 * heightmap, public/data/ca-terrain.png), drawn with raw WebGL2.
 *
 *   rise     points lift from a flat datum to their elevation, rippling out
 *            from Sacramento (once per visit)
 *   stakes   active sites get survey stakes — HTML, projected each frame, so
 *            names stay crisp and readable by screen readers
 *   stations the camera flies between an oblique opening view, a plan view
 *            for the atlas, and a close view over any site
 *   cut      a section line: the ground south of it falls away and the profile
 *            along it lights up in cinnabar
 *
 * It renders only when something changes (a tween, a pointer move, a resize)
 * and not at all while off screen. Reduced motion: final state, no flights.
 */
import { perspective, lookAt, multiply, project, clamp, lerp, easeInOut, easeOut, type Mat4 } from './math';

export interface Station { slug: string; lat: number; lng: number; label: string; place: string; status: string; no: string; href: string }
interface BBox { west: number; east: number; south: number; north: number }
interface Pose { tx: number; tz: number; dist: number; pitch: number; yaw: number }

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;      // plane x,z
layout(location=1) in float aElev;    // 0..1
layout(location=2) in float aState;   // 1 in California, 0 neighbour
layout(location=3) in float aDelay;   // 0..1 distance from Sacramento
layout(location=4) in float aRow;     // 0..1 north→south
uniform mat4 uMVP;
uniform float uRise;     // 0..1.7 global rise clock
uniform float uRelief;
uniform float uCut;      // 0..1 section cut amount
uniform float uCutRow;   // row of the section line (0..1)
uniform float uRowStep;
uniform float uPx;
out float vElev; out float vState; out float vHot; out float vFade;
void main() {
  float t = clamp((uRise - aDelay * 0.7) / 0.9, 0.0, 1.0);
  float rise = 1.0 - pow(1.0 - t, 4.0);
  float south = step(uCutRow + uRowStep * 0.5, aRow);
  float onLine = 1.0 - step(uRowStep * 0.75, abs(aRow - uCutRow));
  float y = aElev * uRelief * rise;
  y -= south * uCut * 0.35;
  vec4 p = uMVP * vec4(aPos.x, y, aPos.y, 1.0);
  gl_Position = p;
  vElev = aElev; vState = aState;
  vHot = onLine * uCut;
  vFade = (1.0 - south * uCut * 0.92) * (0.35 + 0.65 * t);
  float base = mix(1.1, 2.1, aState) + aElev * 2.6 * aState + vHot * 2.2;
  gl_PointSize = base * uPx * clamp(18.0 / p.w, 0.55, 2.1);
}`;

const FRAG = `#version 300 es
precision mediump float;
in float vElev; in float vState; in float vHot; in float vFade;
uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uHot; uniform float uAlpha;
out vec4 color;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.3, d);
  vec3 col = mix(uLow, uHigh, smoothstep(0.02, 0.62, vElev));
  // every ~400 m a darker contour band, like a topo sheet
  float band = fract(vElev * 11.0);
  col = mix(col, uHigh, (1.0 - smoothstep(0.0, 0.12, band)) * 0.35 * vState);
  float a = mix(0.18, 0.95, vState) * vFade;
  col = mix(col, uHot, vHot);
  a = max(a, vHot);
  color = vec4(col, a * soft * uAlpha);
}`;

function hexToRgb(h: string): [number, number, number] {
  const m = h.trim().replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export interface Terrain {
  fly(to: 'opening' | 'plan' | 'site', slug?: string, instant?: boolean): void;
  cut(on: boolean): void;
  highlight(slug: string | null): void;
  destroy(): void;
}

export async function createTerrain(root: HTMLElement): Promise<Terrain | null> {
  const canvas = root.querySelector('canvas')!;
  const stakesEl = root.querySelector<HTMLElement>('[data-stakes]');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const bbox = JSON.parse(root.dataset.bbox!) as BBox;
  const stations = JSON.parse(root.dataset.stations || '[]') as Station[];

  /* ------------------------------------------------------ heightmap → points */
  const img = await createImageBitmap(await (await fetch(root.dataset.src!)).blob());
  const off = document.createElement('canvas');
  off.width = img.width; off.height = img.height;
  const ctx2 = off.getContext('2d', { willReadFrequently: true })!;
  ctx2.drawImage(img, 0, 0);
  // premultiplied canvas would zero RGB where alpha is 0; sea cells are skipped anyway
  const px = ctx2.getImageData(0, 0, img.width, img.height).data;
  const W = img.width, H = img.height;
  const midLat = ((bbox.north + bbox.south) / 2) * (Math.PI / 180);
  const PLANE_H = 10;
  const PLANE_W = PLANE_H * ((bbox.east - bbox.west) * Math.cos(midLat)) / (bbox.north - bbox.south);
  const toPlane = (lat: number, lng: number) => ({
    x: ((lng - bbox.west) / (bbox.east - bbox.west) - 0.5) * PLANE_W,
    z: ((bbox.north - lat) / (bbox.north - bbox.south) - 0.5) * PLANE_H,
    row: (bbox.north - lat) / (bbox.north - bbox.south),
  });
  const HOME = toPlane(38.58, -121.49); // Sacramento
  const step = coarse || window.innerWidth < 720 ? 2 : 1;
  const RELIEF = 1.05;

  const data: number[] = [];
  const elevAt = new Float32Array(W * H);
  let maxD = 0;
  for (let r = 0; r < H; r += step) {
    for (let c = 0; c < W; c += step) {
      const i = (r * W + c) * 4;
      const a = px[i + 3], sea = px[i + 1] > 127;
      elevAt[r * W + c] = px[i] / 255;
      if (a < 40 || sea) continue;
      const x = ((c + 0.5) / W - 0.5) * PLANE_W;
      const z = ((r + 0.5) / H - 0.5) * PLANE_H;
      const d = Math.hypot(x - HOME.x, z - HOME.z);
      maxD = Math.max(maxD, d);
      data.push(x, z, px[i] / 255, a > 200 ? 1 : 0, d, (r + 0.5) / H);
    }
  }
  for (let k = 4; k < data.length; k += 6) data[k] /= maxD;
  const count = data.length / 6;
  const sampleElev = (lat: number, lng: number) => {
    const c = Math.round(((lng - bbox.west) / (bbox.east - bbox.west)) * W - 0.5);
    const r = Math.round(((bbox.north - lat) / (bbox.north - bbox.south)) * H - 0.5);
    return elevAt[clamp(r, 0, H - 1) * W + clamp(c, 0, W - 1)] || 0;
  };

  /* --------------------------------------------------------------- GL setup */
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  gl.useProgram(prog);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  const F = 4 * 6;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, F, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, F, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, F, 12);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, F, 16);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, F, 20);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = { mvp: U('uMVP'), rise: U('uRise'), relief: U('uRelief'), cut: U('uCut'), cutRow: U('uCutRow'), rowStep: U('uRowStep'), px: U('uPx'), low: U('uLow'), high: U('uHigh'), hot: U('uHot'), alpha: U('uAlpha') };
  gl.uniform1f(u.relief, RELIEF);
  gl.uniform1f(u.rowStep, step / H);
  gl.uniform1f(u.alpha, 1);
  const CUT_ROW = clamp(toPlane(37.2, -120).row);
  gl.uniform1f(u.cutRow, CUT_ROW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  const setColors = () => {
    gl.useProgram(prog);
    gl.uniform3fv(u.low, hexToRgb(token('--relief')));
    gl.uniform3fv(u.high, hexToRgb(token('--relief-hi')));
    gl.uniform3fv(u.hot, hexToRgb(token('--cinnabar')));
    request();
  };

  /* ---------------------------------------------------------------- camera */
  const FOV = (32 * Math.PI) / 180;
  let cw = 1, ch = 1, dpr = 1;
  const fitDist = () => {
    const aspect = cw / ch;
    const t = Math.tan(FOV / 2);
    return Math.max((PLANE_H * 1.02) / (2 * t), (PLANE_W * 1.1) / (2 * t * aspect));
  };
  const poseFor = (to: string, slug?: string): Pose => {
    if (to === 'plan') return { tx: 0, tz: 0.15, dist: fitDist(), pitch: 1.42, yaw: 0 };
    if (to === 'site') {
      const s = stations.find((x) => x.slug === slug);
      if (s) { const p = toPlane(s.lat, s.lng); return { tx: p.x, tz: p.z + 0.2, dist: 7.4, pitch: 0.98, yaw: -0.26 }; }
    }
    // opening: an oblique view from the south-west, the Sierra catching the
    // light. A tall frame (phones, narrow columns) needs a steeper camera to
    // keep the whole state in view.
    if (cw / ch < 0.95) return { tx: 0.1, tz: 0.3, dist: fitDist() * 1.1, pitch: 1.02, yaw: -0.2 };
    return { tx: 0.45, tz: 0.4, dist: fitDist() * 1.1, pitch: 0.7, yaw: -0.36 };
  };
  let pose: Pose = poseFor('opening');
  let from: Pose = pose, to: Pose = pose, flyT0 = 0, flyDur = 1;
  let target = 'opening';
  let parallax = { x: 0, y: 0 }, parallaxGoal = { x: 0, y: 0 };

  /* ----------------------------------------------------------------- state */
  let riseT0 = performance.now();
  const RISE_END = 1.75;
  let cut = 0, cutGoal = 0;
  let hi: string | null = null;
  let frame = 0, visible = true;
  let mvp: Mat4 = new Float32Array(16);

  const stakeEls = new Map<string, HTMLElement>();
  if (stakesEl) {
    for (const s of stations) {
      const el = document.createElement('a');
      el.className = `stake stake--${s.status}`;
      el.href = s.href;
      el.dataset.slug = s.slug;
      el.innerHTML = `<span class="stake__pole"></span><span class="stake__flag"></span><span class="stake__label"><b></b><span></span></span>`;
      el.querySelector('b')!.textContent = s.no;
      el.querySelector('.stake__label span')!.textContent = s.label;
      el.setAttribute('aria-label', `${s.label}, ${s.place}`);
      el.tabIndex = -1;
      stakesEl.append(el);
      stakeEls.set(s.slug, el);
    }
  }

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(u.px, dpr * (step === 2 ? 1.45 : 1));
    const p = poseFor(target, hi ?? undefined);
    from = to = pose = p;
    request();
  };

  const render = (now: number) => {
    frame = 0;
    const rise = reduced ? RISE_END : Math.min(RISE_END, (now - riseT0) / 1000);
    const ft = reduced ? 1 : clamp((now - flyT0) / flyDur);
    const e = easeInOut(ft);
    pose = {
      tx: lerp(from.tx, to.tx, e), tz: lerp(from.tz, to.tz, e), dist: lerp(from.dist, to.dist, e),
      pitch: lerp(from.pitch, to.pitch, e), yaw: lerp(from.yaw, to.yaw, e),
    };
    parallax.x += (parallaxGoal.x - parallax.x) * 0.08;
    parallax.y += (parallaxGoal.y - parallax.y) * 0.08;
    cut += (cutGoal - cut) * (reduced ? 1 : 0.075);
    const yaw = pose.yaw + parallax.x * 0.07;
    const pitch = clamp(pose.pitch + parallax.y * 0.035, 0.2, 1.52);
    const eye = [
      pose.tx + pose.dist * Math.sin(yaw) * Math.cos(pitch),
      pose.dist * Math.sin(pitch),
      pose.tz + pose.dist * Math.cos(yaw) * Math.cos(pitch),
    ];
    const proj = perspective(FOV, cw / ch, 0.1, 200);
    const view = lookAt(eye, [pose.tx, 0.15, pose.tz]);
    mvp = multiply(proj, view);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(u.mvp, false, mvp);
    gl.uniform1f(u.rise, rise);
    gl.uniform1f(u.cut, cut);
    gl.drawArrays(gl.POINTS, 0, count);

    // stakes: rise after the terrain settles, hide during the cut
    const stakeIn = reduced ? 1 : easeOut(clamp((rise - 1.2) / 0.5));
    for (const s of stations) {
      const el = stakeEls.get(s.slug);
      if (!el) continue;
      const p = toPlane(s.lat, s.lng);
      const g = project(mvp, p.x, sampleElev(s.lat, s.lng) * RELIEF, p.z, cw, ch);
      const on = g.visible && g.x > -40 && g.x < cw + 40 && g.y > -40 && g.y < ch + 40;
      el.style.transform = `translate3d(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px, 0)`;
      el.style.opacity = on ? String(stakeIn * (1 - cut)) : '0';
      el.style.setProperty('--grow', String(stakeIn));
      el.classList.toggle('is-hi', hi === s.slug);
    }

    const moving = rise < RISE_END || ft < 1 || Math.abs(cut - cutGoal) > 0.002 ||
      Math.abs(parallax.x - parallaxGoal.x) > 0.002 || Math.abs(parallax.y - parallaxGoal.y) > 0.002;
    if (moving && visible) request();
  };
  function request() { if (!frame && visible) frame = requestAnimationFrame(render); }

  /* ----------------------------------------------------------------- wiring */
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) request(); });
  io.observe(canvas);
  const onTheme = () => setColors();
  window.addEventListener('themechange', onTheme);
  const onPointer = (e: PointerEvent) => {
    if (reduced || e.pointerType !== 'mouse') return;
    parallaxGoal = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 };
    request();
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.add('is-static'); });

  setColors();
  resize();
  riseT0 = performance.now();
  root.classList.add('is-live');

  return {
    fly(where, slug, instant) {
      const next = poseFor(where, slug);
      target = where;
      if (slug) hi = slug;
      from = { ...pose }; to = next;
      flyT0 = performance.now();
      flyDur = instant || reduced ? 1 : where === 'site' ? 1250 : 1600;
      if (instant) { from = to = pose = next; }
      request();
    },
    cut(on) {
      cutGoal = on ? 1 : 0;
      request();
    },
    highlight(slug) { hi = slug; request(); },
    destroy() {
      ro.disconnect(); io.disconnect();
      window.removeEventListener('themechange', onTheme);
      window.removeEventListener('pointermove', onPointer);
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
