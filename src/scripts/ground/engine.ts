/**
 * The ground: one WebGL2 canvas that draws California (statewide grid), a
 * site's close-up when the camera is near it, and a geological section when
 * asked — plus HTML overlays (survey stakes, borings, photo frames, labels)
 * projected each frame so text stays crisp and links stay links.
 *
 * The page never animates the camera directly. It sets a goal — a pose and a
 * scene — and the engine eases toward it with frame-rate independent damping,
 * so scroll-driven goals feel continuous and a single goal flies smoothly.
 * It renders only while something is moving and pauses in hidden tabs.
 */
import { perspective, lookAt, multiply, project, invert, unprojectToGround, shifted, clamp, damp, easeOut, type Mat4 } from './math';
import { STATE_VS, PATCH_VS, SECTION_VS, FS } from './shaders';
import { makeWorld, loadGrid, stateCloud, patchCloud, sectionCloud, sampleGrid, type BBox, type Grid, type PatchSpec, type World, type Boring } from './world';

export interface Pose { tx: number; ty: number; tz: number; dist: number; pitch: number; yaw: number; sx: number; sy: number }
export interface Scene {
  relief: number;            // plane units per 4,400 m (1.05 ≈ 26× statewide)
  cut: number;               // 0..1 the ground south of the section line falls away
  section: number;           // 0..1.4 section reveal clock
  patch: string | null;      // site whose close-up is drawn
  patchW: number;            // 0..1
  focus: string | null;      // flagged site
  stakes: number;            // 0..1
  photos: number;            // 0..1 photo frames
  photo: number;             // active photo index
  home: number;              // 0..1 "based here" marker
  alpha: number;             // 0..1 whole ground
  drift: number;             // 0..1 a slow idle sway at rest (the opening, the close)
}
export interface Station { slug: string; lat: number; lng: number; label: string; place: string; status: string; no: string; href: string }
export interface Site extends PatchSpec { slug: string; url: string }
export interface Photo { src: string; caption: string; lat: number; lng: number; href?: string }
export interface FrameInfo { lat: number; lng: number; exaggeration: number; scaleKm: number; scalePx: number }

export interface GroundConfig {
  root: HTMLElement;                 // gets is-live / is-static
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  groundUrl: string;
  bbox: BBox;
  stations: Station[];
  sites: Site[];
  section?: { lat: number };
  photos?: Photo[];
  home?: { lat: number; lng: number; label: string };
  interactive?: boolean;             // torch, lens, drag to orbit
  onFrame?: (info: FrameInfo) => void;
  onLens?: (ll: { lat: number; lng: number } | null) => void;
}

export interface GroundEngine {
  world: World;
  grid: Grid;
  size(): { w: number; h: number };
  /** Elevation (0..1) at a site, from its close-up when loaded. */
  siteElev(slug: string): number;
  elevAt(lat: number, lng: number): number;
  fitStateDist(aspect?: number): number;
  setGoal(pose: Pose, scene?: Partial<Scene>, opts?: { k?: number; snap?: boolean }): void;
  rise(on: boolean): void;
  loadPatch(slug: string): Promise<void>;
  prepareSection(): void;
  destroy(): void;
}

const FOV = (32 * Math.PI) / 180;
const RELIEF = 1.05;
const DEFAULT_SCENE: Scene = { relief: RELIEF, cut: 0, section: 0, patch: null, patchW: 0, focus: null, stakes: 1, photos: 0, photo: 0, home: 0, alpha: 1, drift: 0 };

const hexToRgb = (h: string): [number, number, number] => {
  const m = h.trim().replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const NUM: (keyof Pose)[] = ['tx', 'ty', 'tz', 'dist', 'pitch', 'yaw', 'sx', 'sy'];
const NUM_SCENE = ['relief', 'cut', 'section', 'patchW', 'stakes', 'photos', 'photo', 'home', 'alpha', 'drift'] as const;

export async function createGround(cfg: GroundConfig): Promise<GroundEngine | null> {
  const { canvas, overlay, root } = cfg;
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const grid = await loadGrid(cfg.groundUrl);
  if (!grid) return null;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
  const world = makeWorld(cfg.bbox);
  const home = world.toPlane(38.58, -121.49);
  const step = coarse ? 2 : 1;

  /* ------------------------------------------------------------- programs */
  const compile = (vs: string) => {
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    const cache = new Map<string, WebGLUniformLocation | null>();
    return { p, u: (n: string) => { if (!cache.has(n)) cache.set(n, gl.getUniformLocation(p, n)); return cache.get(n)!; } };
  };
  let progs: { state: ReturnType<typeof compile>; patch: ReturnType<typeof compile>; section: ReturnType<typeof compile> };
  try {
    progs = { state: compile(STATE_VS), patch: compile(PATCH_VS), section: compile(SECTION_VS) };
  } catch (e) {
    console.warn('[ground]', e);
    return null;
  }

  const cloud = (data: Float32Array) => {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const F = 24;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, F, 0);
    for (let i = 1; i <= 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 1, gl.FLOAT, false, F, 4 + i * 4); }
    gl.bindVertexArray(null);
    return { vao, buf, count: data.length / 6 };
  };
  const state = cloud(stateCloud(grid, world, step, home));
  const cellZ = (world.planeH / grid.h) * step;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  let colors = { low: [0, 0, 0], high: [1, 1, 1], hot: [1, 0, 0], water: [0, 0, 1] } as Record<string, number[]>;
  const readColors = () => {
    colors = { low: hexToRgb(token('--relief')), high: hexToRgb(token('--relief-hi')), hot: hexToRgb(token('--cinnabar')), water: hexToRgb(token('--water')) };
    request();
  };

  /* --------------------------------------------------------------- patches */
  const patches = new Map<string, { vao: WebGLVertexArrayObject; count: number; rect: [number, number, number, number]; range: [number, number]; spacing: number; center: number; site: Site } | 'loading' | 'none'>();
  async function loadPatch(slug: string) {
    if (patches.has(slug)) return;
    const site = cfg.sites.find((s) => s.slug === slug);
    if (!site) { patches.set(slug, 'none'); return; }
    patches.set(slug, 'loading');
    const g = await loadGrid(site.url);
    if (!g) { patches.set(slug, 'none'); return; }
    const { data, rect, range } = patchCloud(g, world, site);
    const c = cloud(data);
    const mid = Math.floor(g.h / 2) * g.w + Math.floor(g.w / 2);
    patches.set(slug, { vao: c.vao, count: c.count, rect, range, spacing: (rect[2] - rect[0]) / g.w, center: g.elev[mid], site });
    request();
  }

  /* --------------------------------------------------------------- section */
  let section: { vao: WebGLVertexArrayObject; count: number; z: number; borings: Boring[]; west: number; east: number; base: number } | null = null;
  const prepareSection = () => {
    if (section || !cfg.section) return;
    const s = sectionCloud(grid, world, cfg.section.lat, cfg.stations);
    const c = cloud(s.data);
    section = { vao: c.vao, count: c.count, z: s.z, borings: s.borings, west: s.west, east: s.east, base: s.base };
    buildSectionLabels();
    request();
  };
  const cutZ = cfg.section ? world.toPlane(cfg.section.lat, cfg.bbox.west).z : 99;

  /* --------------------------------------------------------------- overlays */
  const el = (cls: string, html = '', tag = 'span') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
  const stakeEls = new Map<string, HTMLElement>();
  for (const s of cfg.stations) {
    const a = el(`stake stake--${s.status}`, '<span class="stake__pole"></span><span class="stake__flag"></span><span class="stake__label"><b></b><span></span></span>', 'a') as HTMLAnchorElement;
    a.href = s.href;
    a.tabIndex = -1;
    a.setAttribute('aria-label', `${s.label}, ${s.place}`);
    a.querySelector('b')!.textContent = s.no;
    (a.querySelector('.stake__label span') as HTMLElement).textContent = s.label;
    overlay.append(a);
    stakeEls.set(s.slug, a);
  }
  const homeEl = cfg.home ? el('ground-home', `<span class="ground-home__ring"></span><span class="ground-home__dot"></span><span class="ground-home__label"></span>`) : null;
  if (homeEl && cfg.home) { homeEl.querySelector('.ground-home__label')!.textContent = cfg.home.label; overlay.append(homeEl); }

  const secEls: { el: HTMLElement; x: number; surf: number; depth: number }[] = [];
  function buildSectionLabels() {
    if (!section) return;
    const add = (html: string, cls: string, x: number, surf: number, depth: number) => { const e = el(`ground-sec ${cls}`, html); overlay.append(e); secEls.push({ el: e, x, surf, depth }); };
    add('A', 'ground-sec--end', section.west, 0, -0.08);
    add('A′', 'ground-sec--end', section.east, 0, -0.08);
    for (const b of section.borings) add(`<b>B-${b.no}</b><span> ${b.label}</span>`, 'ground-sec--boring', b.x, b.surf, -0.02);
    // the water table's conventional mark sits over the valley floor
    const valley = world.toPlane(cfg.section!.lat, -121.65).x; // the Sacramento Valley on the line
    add('<i aria-hidden="true">▽</i> Water table', 'ground-sec--water', valley, sampleGrid(grid!, world, valley, section.z), 0.03);
  }

  const photoEls: HTMLElement[] = [];
  for (const [i, p] of (cfg.photos ?? []).entries()) {
    const f = el('ground-photo', '<img alt="" loading="lazy" decoding="async">', p.href ? 'a' : 'span');
    if (p.href) { (f as HTMLAnchorElement).href = p.href; (f as HTMLAnchorElement).tabIndex = -1; }
    (f.querySelector('img') as HTMLImageElement).src = p.src;
    f.style.setProperty('--i', String(i));
    overlay.append(f);
    photoEls.push(f);
  }

  /* ---------------------------------------------------------------- camera */
  let cw = 1, ch = 1, dpr = 1, screenK = 1;
  const fitStateDist = (aspect = cw / ch) => {
    const t = Math.tan(FOV / 2);
    return Math.max((world.planeH * 1.02) / (2 * t), (world.planeW * 1.1) / (2 * t * aspect));
  };
  let pose: Pose = { tx: 0.3, ty: 0.15, tz: 0.4, dist: 20, pitch: 0.7, yaw: -0.36, sx: 0, sy: 0 };
  let goal: Pose = { ...pose };
  let scene: Scene = { ...DEFAULT_SCENE };
  let sceneGoal: Scene = { ...DEFAULT_SCENE };
  let kPose = 5, kScene = 4.5;
  let orbit = { yaw: 0, pitch: 0 }, orbitGoal = { yaw: 0, pitch: 0 }, dragging = false, lastDrag = 0;
  let torch = { x: 0, z: 0, r: 0 }, torchGoal = { x: 0, z: 0, r: 0 };

  let riseT0 = performance.now(), riseOn = !reduced;
  const RISE_END = 1.75;
  let frame = 0, last = performance.now(), running = true, idle = true;
  let lastActivity = performance.now();
  const DRIFT_FOR = 40000; // the idle sway stops after 40 s untouched: no busy GPU in a forgotten tab
  let mvp: Mat4 = new Float32Array(16);

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const nextDpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1);
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    // Setting a canvas's size clears it, so only do it when the size really
    // changed (not for a sub-pixel wobble), and draw again at once rather
    // than showing a blank frame until the next animation frame.
    if (Math.abs(w - cw) < 1 && Math.abs(h - ch) < 1 && nextDpr === dpr) return;
    dpr = nextDpr; cw = w; ch = h;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    screenK = (canvas.height * 0.5) / Math.tan(FOV / 2);
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (running) render(performance.now());
  };

  const settled = () => {
    for (const k of NUM) if (Math.abs(pose[k] - goal[k]) > (k === 'dist' ? 0.002 : 0.0006)) return false;
    for (const k of NUM_SCENE) if (Math.abs(scene[k] - sceneGoal[k]) > 0.002) return false;
    if (Math.abs(orbit.yaw - orbitGoal.yaw) > 0.0005 || Math.abs(orbit.pitch - orbitGoal.pitch) > 0.0005) return false;
    if (Math.abs(torch.r - torchGoal.r) > 0.001 || Math.abs(torch.x - torchGoal.x) > 0.001 || Math.abs(torch.z - torchGoal.z) > 0.001) return false;
    return true;
  };

  const siteElev = (slug: string) => {
    const p = patches.get(slug);
    if (p && typeof p === 'object') return p.center;
    const s = cfg.stations.find((x) => x.slug === slug);
    return s ? elevAt(s.lat, s.lng) : 0;
  };
  const elevAt = (lat: number, lng: number) => { const p = world.toPlane(lat, lng); return sampleGrid(grid, world, p.x, p.z); };

  const render = (now: number) => {
    frame = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // ease toward the goal
    for (const k of NUM) pose[k] = damp(pose[k], goal[k], kPose, dt);
    for (const k of NUM_SCENE) (scene[k] as number) = damp(scene[k], sceneGoal[k], kScene, dt);
    scene.patch = sceneGoal.patch; scene.focus = sceneGoal.focus;
    if (!dragging && now - lastDrag > 2600) orbitGoal = { yaw: 0, pitch: 0 };
    orbit.yaw = dragging ? orbitGoal.yaw : damp(orbit.yaw, orbitGoal.yaw, 1.6, dt);
    orbit.pitch = dragging ? orbitGoal.pitch : damp(orbit.pitch, orbitGoal.pitch, 1.6, dt);
    torch.x = damp(torch.x, torchGoal.x, 14, dt); torch.z = damp(torch.z, torchGoal.z, 14, dt); torch.r = damp(torch.r, torchGoal.r, 6, dt);

    const rise = riseOn ? Math.min(RISE_END, (now - riseT0) / 1000) : RISE_END;
    const drifting = !reduced && scene.drift > 0.01 && now - lastActivity < DRIFT_FOR;
    const sway = reduced ? 0 : scene.drift * Math.sin(now / 5200) * 0.05;
    const yaw = pose.yaw + orbit.yaw + sway;
    const pitch = clamp(pose.pitch + orbit.pitch, 0.04, 1.54);
    const eye = [
      pose.tx + pose.dist * Math.sin(yaw) * Math.cos(pitch),
      pose.ty + pose.dist * Math.sin(pitch),
      pose.tz + pose.dist * Math.cos(yaw) * Math.cos(pitch),
    ];
    const proj = shifted(perspective(FOV, cw / ch, Math.max(0.02, pose.dist * 0.02), 400), pose.sx, pose.sy);
    mvp = multiply(proj, lookAt(eye, [pose.tx, pose.ty, pose.tz]));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pa = scene.patch ? patches.get(scene.patch) : undefined;
    const patch = pa && typeof pa === 'object' ? pa : null;
    const patchW = patch ? scene.patchW : 0;
    const common = (pr: ReturnType<typeof compile>) => {
      gl.useProgram(pr.p);
      gl.uniformMatrix4fv(pr.u('uMVP'), false, mvp);
      gl.uniform1f(pr.u('uRelief'), scene.relief);
      gl.uniform1f(pr.u('uPx'), dpr * (step === 2 ? 1.35 : 1));
      gl.uniform3f(pr.u('uTorch'), torch.x, torch.z, torch.r > 0.002 ? torch.r : 0);
      gl.uniform3fv(pr.u('uLow'), colors.low); gl.uniform3fv(pr.u('uHigh'), colors.high);
      gl.uniform3fv(pr.u('uHot'), colors.hot); gl.uniform3fv(pr.u('uWater'), colors.water);
      gl.uniform1f(pr.u('uAlpha'), scene.alpha);
      gl.uniform1f(pr.u('uScreenK'), screenK);
      gl.uniform1f(pr.u('uFocus'), pose.dist);
    };
    // state
    common(progs.state);
    const sp = progs.state;
    gl.uniform1f(sp.u('uRise'), rise);
    gl.uniform1f(sp.u('uCut'), scene.cut);
    gl.uniform1f(sp.u('uCutZ'), cutZ);
    gl.uniform1f(sp.u('uCellZ'), cellZ);
    gl.uniform4fv(sp.u('uPatch'), patch ? patch.rect : [0, 0, 0, 0]);
    gl.uniform1f(sp.u('uPatchW'), patchW);
    gl.uniform1f(sp.u('uCell'), cellZ);
    gl.bindVertexArray(state.vao);
    gl.drawArrays(gl.POINTS, 0, state.count);
    // close-up
    if (patch && patchW > 0.004) {
      common(progs.patch);
      const pp = progs.patch;
      gl.uniform4fv(pp.u('uPatch'), patch.rect);
      gl.uniform1f(pp.u('uPatchW'), patchW);
      gl.uniform1f(pp.u('uRadiusKm'), patch.site.radiusKm);
      gl.uniform1f(pp.u('uSpacing'), patch.spacing);
      gl.uniform2fv(pp.u('uRange'), patch.range);
      gl.bindVertexArray(patch.vao);
      gl.drawArrays(gl.POINTS, 0, patch.count);
    }
    // section
    if (section && scene.section > 0.004) {
      common(progs.section);
      gl.uniform1f(progs.section.u('uSection'), scene.section);
      gl.bindVertexArray(section.vao);
      gl.drawArrays(gl.POINTS, 0, section.count);
    }
    gl.bindVertexArray(null);

    placeOverlays(rise, patch);
    if (cfg.onFrame) {
      const c = world.toLatLng(pose.tx, pose.tz);
      const a = project(mvp, pose.tx, pose.ty, pose.tz, cw, ch), b = project(mvp, pose.tx + 10 / world.kmPerUnit, pose.ty, pose.tz, cw, ch);
      const pxPer10 = Math.hypot(b.x - a.x, b.y - a.y);
      const nice = [1, 2, 5, 10, 20, 50, 100, 200];
      const scaleKm = nice.find((k) => (k / 10) * pxPer10 >= 70) ?? 200;
      cfg.onFrame({ lat: c.lat, lng: c.lng, exaggeration: world.exaggeration(scene.relief), scaleKm, scalePx: (scaleKm / 10) * pxPer10 });
    }
    if (running && (!settled() || (riseOn && rise < RISE_END) || dragging || drifting)) request();
    else idle = true;
  };

  function placeOverlays(rise: number, patch: { site: Site; center: number } | null) {
    const stakeIn = riseOn ? easeOut(clamp((rise - 1.2) / 0.5)) : 1;
    const inView = (g: { x: number; y: number; visible: boolean }, m = 60) => g.visible && g.x > -m && g.x < cw + m && g.y > -m && g.y < ch + m;
    for (const s of cfg.stations) {
      const a = stakeEls.get(s.slug)!;
      const p = world.toPlane(s.lat, s.lng);
      const e = patch && patch.site.slug === s.slug && scene.patchW > 0.5 ? patch.center : elevAt(s.lat, s.lng);
      const g = project(mvp, p.x, e * scene.relief, p.z, cw, ch);
      const on = inView(g);
      const hi = scene.focus === s.slug;
      a.style.transform = `translate3d(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px, 0)`;
      a.style.opacity = on ? String(stakeIn * scene.stakes * (1 - scene.cut) * (scene.focus && !hi ? 0.55 : 1)) : '0';
      a.style.setProperty('--grow', String(stakeIn));
      a.classList.toggle('is-hi', hi);
      a.style.pointerEvents = on && scene.stakes > 0.5 ? 'auto' : 'none';
    }
    if (homeEl && cfg.home) {
      const p = world.toPlane(cfg.home.lat, cfg.home.lng);
      const g = project(mvp, p.x, elevAt(cfg.home.lat, cfg.home.lng) * scene.relief, p.z, cw, ch);
      homeEl.style.transform = `translate3d(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px, 0)`;
      homeEl.style.opacity = inView(g) ? String(scene.home) : '0';
    }
    if (section) {
      for (const s of secEls) {
        const g = project(mvp, s.x, s.surf * scene.relief - s.depth, section.z, cw, ch);
        s.el.style.transform = `translate3d(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px, 0)`;
        s.el.style.opacity = inView(g) ? String(clamp((scene.section - 0.55) / 0.4)) : '0';
      }
    }
    if (photoEls.length && cfg.photos) {
      // a hand of cards standing over the site, the active one lifted
      const n = photoEls.length;
      cfg.photos.forEach((ph, i) => {
        const f = photoEls[i];
        const p = world.toPlane(ph.lat, ph.lng);
        const e = patch && Math.abs(patch.site.lat - ph.lat) < 0.02 && Math.abs(patch.site.lng - ph.lng) < 0.02 && scene.patchW > 0.5 ? patch.center : elevAt(ph.lat, ph.lng);
        const g = project(mvp, p.x, e * scene.relief, p.z, cw, ch);
        const rel = i - scene.photo;
        const spread = clamp(rel, -3.5, 3.5);
        const lift = Math.max(0, 1 - Math.abs(rel));
        const x = g.x + spread * 34;
        const y = g.y - 96 - lift * 26 + Math.abs(spread) * 8;
        f.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(spread * 5).toFixed(2)}deg) scale(${(0.82 + lift * 0.3).toFixed(3)})`;
        f.style.zIndex = String(100 - Math.round(Math.abs(rel) * 10));
        f.style.opacity = inView(g, 200) ? String(scene.photos * (Math.abs(rel) > 3.6 ? 0 : 1)) : '0';
        f.classList.toggle('is-on', Math.abs(rel) < 0.5);
        f.style.pointerEvents = scene.photos > 0.5 ? 'auto' : 'none';
        void n;
      });
    }
  }

  function request() {
    if (frame || !running) return;
    if (idle) { last = performance.now() - 1000 / 60; idle = false; } // no catch-up jump after a rest
    frame = requestAnimationFrame(render);
  }

  /* ----------------------------------------------------------------- input */
  const groundAt = (clientX: number, clientY: number) => {
    const inv = invert(mvp);
    if (!inv) return null;
    const r = canvas.getBoundingClientRect();
    return unprojectToGround(inv, clientX - r.left, clientY - r.top, cw, ch, pose.ty);
  };
  let dragFrom: { x: number; y: number; yaw: number; pitch: number } | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    lastActivity = performance.now();
    if (dragFrom) {
      orbitGoal = {
        yaw: dragFrom.yaw - ((e.clientX - dragFrom.x) / cw) * 2.4,
        pitch: clamp(dragFrom.pitch + ((e.clientY - dragFrom.y) / ch) * 1.2, -0.6, 0.6),
      };
      lastDrag = performance.now();
      request();
      return;
    }
    const g = groundAt(e.clientX, e.clientY);
    if (g) {
      torchGoal = { x: g.x, z: g.z, r: clamp(pose.dist * 0.075, 0.05, 1.4) };
      if (torch.r < 0.002) { torch.x = g.x; torch.z = g.z; }
      const ll = world.toLatLng(g.x, g.z);
      const inBox = ll.lat > cfg.bbox.south && ll.lat < cfg.bbox.north && ll.lng > cfg.bbox.west && ll.lng < cfg.bbox.east;
      cfg.onLens?.(inBox ? ll : null);
    } else { torchGoal.r = 0; cfg.onLens?.(null); }
    request();
  };
  const onLeave = () => { torchGoal.r = 0; cfg.onLens?.(null); request(); };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragFrom = { x: e.clientX, y: e.clientY, yaw: orbitGoal.yaw, pitch: orbitGoal.pitch };
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
  };
  const onUp = (e: PointerEvent) => {
    if (!dragFrom) return;
    dragFrom = null; dragging = false; lastDrag = performance.now();
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    root.classList.remove('is-dragging');
    request();
  };
  if (cfg.interactive !== false) {
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const onVis = () => { running = !document.hidden; if (running) { last = performance.now(); request(); } };
  document.addEventListener('visibilitychange', onVis);
  const onTheme = () => readColors();
  window.addEventListener('themechange', onTheme);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; root.classList.remove('is-live'); root.classList.add('is-static'); });

  readColors();
  resize();
  root.classList.add('is-live');

  return {
    world, grid,
    size: () => ({ w: cw, h: ch }),
    siteElev, elevAt, fitStateDist,
    setGoal(p, s, opts) {
      lastActivity = performance.now();
      goal = { ...p };
      if (s) sceneGoal = { ...sceneGoal, ...s };
      if (sceneGoal.patch) void loadPatch(sceneGoal.patch);
      if (sceneGoal.section > 0) prepareSection();
      kPose = opts?.k ?? 5;
      if (opts?.snap || reduced) { pose = { ...goal }; scene = { ...sceneGoal }; }
      request();
    },
    rise(on) { riseOn = on && !reduced; riseT0 = performance.now(); request(); },
    loadPatch, prepareSection,
    destroy() {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('themechange', onTheme);
      overlay.replaceChildren();
    },
  };
}
