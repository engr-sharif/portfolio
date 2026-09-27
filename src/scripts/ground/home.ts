/**
 * Home: the camera follows the reading position across the whole page.
 *
 * Elements marked data-ground="<stage>" are anchors. The line at mid-screen
 * falls between two of them; the pose and scene are blended between the two,
 * holding still while an anchor sits near the middle and travelling in
 * between. A long hop between close-ups rises and comes back down (an arc)
 * instead of skimming the ground. Under reduced motion the view snaps to the
 * nearest anchor's still.
 *
 * Stages
 *   opening  oblique view of the state, the relief rising from a datum
 *   plan     the whole state from above, every site staked
 *   site     over one site, its stake flagged (the atlas rows)
 *   close    a site's own ground, real 40 km close-up (the work)
 *   section  cut open along 38.6° N: strata, water table, borings (the tools)
 *   photo    the photos standing at the site they were taken (the field)
 *   home     low over Sacramento looking at the Sierra (about)
 *   state    pulled back to the whole state, Sacramento marked (contact)
 */
import { createGround, type GroundEngine, type Pose, type Scene, type FrameInfo } from './engine';
import { clamp, lerp, smoother } from './math';

const root = document.querySelector<HTMLElement>('[data-ground-root]');
const dataEl = document.getElementById('ground-data');
const wide = matchMedia('(min-width: 64rem)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Anchor { el: HTMLElement; kind: string; slug?: string; index: number; y: number; caption: string; fig: string }
interface Frame { pose: Pose; scene: Scene }

const BASE_SCENE: Scene = { relief: 1.05, cut: 0, section: 0, patch: null, patchW: 0, focus: null, stakes: 1, photos: 0, photo: 0, home: 0, alpha: 1, drift: 0 };
const CLOSE_RELIEF = 0.42; // ≈ 11× — at a 40 km scale the statewide 26× would turn hills into spikes

async function start() {
  if (!root || !dataEl) return;
  const cfg = JSON.parse(dataEl.textContent || '{}');
  const hud = {
    fig: root.querySelector<HTMLElement>('[data-hud-fig]'),
    caption: root.querySelector<HTMLElement>('[data-hud-caption]'),
    coords: root.querySelector<HTMLElement>('[data-hud-coords]'),
    bar: root.querySelector<HTMLElement>('[data-hud-bar]'),
    km: root.querySelector<HTMLElement>('[data-hud-km]'),
    exag: root.querySelector<HTMLElement>('[data-hud-exag]'),
  };
  let lens: { lat: number; lng: number } | null = null;
  const fmt = (lat: number, lng: number) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
  const onFrame = (f: FrameInfo) => {
    if (hud.coords) { hud.coords.textContent = lens ? fmt(lens.lat, lens.lng) : fmt(f.lat, f.lng); hud.coords.classList.toggle('is-lens', !!lens); }
    if (hud.bar) hud.bar.style.width = `${f.scalePx.toFixed(0)}px`;
    if (hud.km) hud.km.textContent = `${f.scaleKm} km`;
    if (hud.exag) hud.exag.textContent = `Vertical ×${Math.round(f.exaggeration)}`;
  };

  let g: GroundEngine | null = null;
  try {
    g = await createGround({
      root, canvas: root.querySelector('canvas')!, overlay: root.querySelector('[data-ground-overlay]')!,
      groundUrl: cfg.groundUrl, bbox: cfg.bbox, stations: cfg.stations, sites: cfg.sites,
      section: cfg.section, photos: cfg.photos, home: cfg.home,
      interactive: true, onFrame, onLens: (ll) => { lens = ll; },
    });
  } catch (e) { console.warn('[ground]', e); g = null; }
  if (!g) { root.classList.add('is-static'); document.documentElement.classList.add('ground-static'); return; }
  document.documentElement.classList.add('ground-live');
  const eng = g;
  const w = eng.world;

  /* ------------------------------------------------------------ the poses */
  // the rail covers the left edge of the screen on wide layouts
  const railPx = () => parseFloat(getComputedStyle(document.body).getPropertyValue('--rail-w')) * parseFloat(getComputedStyle(document.documentElement).fontSize) || 0;
  const shiftX = () => (wide.matches ? 0.36 : 0);
  const openAspect = () => { const { w: cw, h } = eng.size(); return wide.matches ? (cw * 0.48) / h : cw / h; };
  const site = (slug?: string) => cfg.stations.find((s: { slug: string }) => s.slug === slug) as { slug: string; lat: number; lng: number } | undefined;
  const spanKm = (slug?: string) => { const x = cfg.sites.find((s: { slug: string }) => s.slug === slug) as { north: number; south: number } | undefined; return x ? (x.north - x.south) * 111.32 : 40; };
  const sitePatch = (lat: number, lng: number) => cfg.sites.find((s: { lat: number; lng: number }) => Math.abs(s.lat - lat) < 0.02 && Math.abs(s.lng - lng) < 0.02) as { slug: string } | undefined;

  function frameFor(a: Anchor): Frame {
    const sx = shiftX();
    const scene: Scene = { ...BASE_SCENE };
    const fit = eng.fitStateDist(openAspect());
    switch (a.kind) {
      case 'opening':
        return wide.matches
          ? { pose: { tx: 0.3, ty: 0.15, tz: 0.35, dist: fit * 0.9, pitch: 0.7, yaw: -0.38, sx, sy: -0.02 }, scene: { ...scene, drift: 1 } }
          : { pose: { tx: 0.1, ty: 0.1, tz: 0.35, dist: fit * 1.02, pitch: 1.0, yaw: -0.2, sx: 0, sy: 0.3 }, scene: { ...scene, drift: 1 } };
      case 'plan':
        return { pose: { tx: 0, ty: 0, tz: 0.12, dist: fit * 1.02, pitch: 1.45, yaw: 0, sx, sy: 0 }, scene };
      case 'state':
        return { pose: { tx: 0.1, ty: 0, tz: 0.2, dist: fit * 1.02, pitch: 1.12, yaw: -0.18, sx, sy: 0 }, scene: { ...scene, home: 1, stakes: 0.45, drift: 1 } };
      case 'site': {
        const s = site(a.slug);
        if (!s) break;
        const p = w.toPlane(s.lat, s.lng);
        return { pose: { tx: p.x, ty: eng.elevAt(s.lat, s.lng) * 1.05, tz: p.z + 0.1, dist: 3.2, pitch: 0.82, yaw: -0.25, sx, sy: 0 }, scene: { ...scene, focus: s.slug, patch: s.slug, patchW: 1 } };
      }
      case 'close': {
        const s = site(a.slug);
        if (!s) break;
        const p = w.toPlane(s.lat, s.lng);
        const yaw = -0.45 + ((a.index % 3) - 1) * 0.42;
        const span = spanKm(s.slug) / 40; // a coarser privacy setting means a wider close-up
        return { pose: { tx: p.x, ty: eng.siteElev(s.slug) * CLOSE_RELIEF, tz: p.z, dist: 0.6 * span, pitch: 0.6, yaw, sx, sy: 0 }, scene: { ...scene, relief: CLOSE_RELIEF, patch: s.slug, patchW: 1, focus: s.slug } };
      }
      case 'section': {
        // phones frame the valley stretch with the borings; wide screens coast to border
        const west = w.toPlane(38.6, wide.matches ? -123.95 : -123.05).x, east = w.toPlane(38.6, wide.matches ? -119.45 : -120.85).x;
        const z = w.toPlane(38.6, -121).z;
        const { w: cw, h } = eng.size();
        const rail = wide.matches ? railPx() : 0;
        const width = east - west;
        const dist = (width / (2 * Math.tan((32 * Math.PI) / 360) * ((cw - rail) / h))) * 1.08;
        return { pose: { tx: (west + east) / 2, ty: 0.12, tz: z, dist: Math.max(dist, 3.2), pitch: 0.1, yaw: 0, sx: rail / cw, sy: wide.matches ? 0.06 : 0.22 }, scene: { ...scene, cut: 1, section: 1.4, stakes: 0 } };
      }
      case 'photo': {
        const ph = cfg.photos[Math.min(cfg.photos.length - 1, Math.max(0, Math.round(a.index)))];
        if (!ph) break;
        const p = w.toPlane(ph.lat, ph.lng);
        const pt = sitePatch(ph.lat, ph.lng);
        const ty = (pt ? eng.siteElev(pt.slug) : eng.elevAt(ph.lat, ph.lng)) * CLOSE_RELIEF;
        return { pose: { tx: p.x, ty, tz: p.z, dist: 0.78, pitch: 0.42, yaw: -0.7 + a.index * 0.16, sx, sy: -0.08 }, scene: { ...scene, relief: CLOSE_RELIEF, patch: pt?.slug ?? null, patchW: pt ? 1 : 0, photos: 1, photo: a.index, stakes: 0, focus: null } };
      }
      case 'home': {
        const p = w.toPlane(38.58, -121.49);
        return { pose: { tx: p.x + 0.35, ty: 0.06, tz: p.z, dist: 3.1, pitch: 0.3, yaw: -1.45, sx, sy: -0.05 }, scene: { ...scene, home: 1, stakes: 0.35 } };
      }
    }
    return { pose: { tx: 0, ty: 0, tz: 0.12, dist: fit, pitch: 1.4, yaw: 0, sx, sy: 0 }, scene };
  }

  /* ---------------------------------------------------------------- blend */
  function blend(a: Frame, b: Frame, t: number): Frame {
    const L = (k: keyof Pose) => lerp(a.pose[k], b.pose[k], t);
    const sep = Math.hypot(a.pose.tx - b.pose.tx, a.pose.tz - b.pose.tz);
    const near = Math.min(a.pose.dist, b.pose.dist);
    const arc = sep > near * 0.4 ? Math.min(3.2, (sep / near) * 0.55) : 0;
    const dist = Math.exp(lerp(Math.log(a.pose.dist), Math.log(b.pose.dist), t)) * (1 + arc * 4 * t * (1 - t));
    const pose: Pose = { tx: L('tx'), ty: L('ty'), tz: L('tz'), dist, pitch: L('pitch'), yaw: L('yaw'), sx: L('sx'), sy: L('sy') };
    const S = (k: 'relief' | 'cut' | 'section' | 'stakes' | 'photos' | 'photo' | 'home' | 'alpha' | 'drift') => lerp(a.scene[k], b.scene[k], t);
    let patch = a.scene.patch, patchW = lerp(a.scene.patchW, b.scene.patchW, t);
    if (a.scene.patch !== b.scene.patch) {
      // hand the close-up over at the top of the arc
      patch = t < 0.5 ? a.scene.patch : b.scene.patch;
      patchW = t < 0.5 ? a.scene.patchW * (1 - t * 2) : b.scene.patchW * (t * 2 - 1);
      if (!patch) patch = a.scene.patch ?? b.scene.patch;
    }
    return {
      pose,
      scene: {
        relief: S('relief'), cut: S('cut'), section: S('section'), stakes: S('stakes'), photos: S('photos'), photo: S('photo'), home: S('home'), alpha: S('alpha'), drift: S('drift'),
        patch, patchW, focus: t < 0.5 ? a.scene.focus : b.scene.focus,
      },
    };
  }

  /* --------------------------------------------------------------- anchors */
  // A steady screen height: phones grow and shrink innerHeight as the address
  // bar slides while scrolling, which would nudge the camera on every slide.
  // Keep the largest height seen at the current width.
  let stableW = window.innerWidth, stableH = window.innerHeight;
  const viewH = () => {
    if (window.innerWidth !== stableW) { stableW = window.innerWidth; stableH = window.innerHeight; }
    else stableH = Math.max(stableH, window.innerHeight);
    return stableH;
  };

  let anchors: Anchor[] = [];
  let measured = false;
  const measure = () => {
    const all = [...document.querySelectorAll<HTMLElement>('[data-ground]')].filter((el) => el.getClientRects().length > 0);
    anchors = all.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        el, kind: el.dataset.ground!, slug: el.dataset.slug, index: Number(el.dataset.index || 0),
        y: r.top + window.scrollY + r.height / 2,
        caption: el.dataset.caption || '', fig: el.dataset.fig || '',
      };
    }).sort((p, q) => p.y - q.y);
    // anchors at the same height (a row of photos) would divide by zero
    anchors = anchors.filter((x, i) => i === 0 || x.y - anchors[i - 1].y > 4);
    // snap only on the first measure; later layout shifts (images arriving)
    // must never jolt a camera that's already moving
    update(!measured);
    measured = true;
  };

  let shown: Anchor | null = null;
  function update(snap = false) {
    if (!anchors.length) return;
    const focus = window.scrollY + viewH() * 0.5;
    let i = anchors.findIndex((x) => x.y > focus) - 1;
    if (i < -1) i = anchors.length - 1;
    const a = anchors[Math.max(0, i)], b = anchors[Math.min(anchors.length - 1, i + 1)];
    let t = i < 0 ? 0 : a === b ? 0 : clamp((focus - a.y) / (b.y - a.y));
    t = reduced ? (t < 0.5 ? 0 : 1) : smoother((t - 0.16) / 0.68);
    const f = i < 0 ? frameFor(anchors[0]) : blend(frameFor(a), frameFor(b), t);
    eng.setGoal(f.pose, f.scene, { snap, k: 5.2 });
    const near = t < 0.5 ? a : b;
    if (near !== shown) {
      shown = near;
      document.querySelectorAll('[data-station].is-on').forEach((x) => x.classList.remove('is-on'));
      near.el.closest('[data-station]')?.classList.add('is-on');
      if (hud.fig && near.fig) hud.fig.textContent = near.fig;
      if (hud.caption && near.caption) hud.caption.textContent = near.caption;
    }
  }

  let raf = 0;
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  window.addEventListener('scroll', onScroll, { passive: true });
  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);
  wide.addEventListener('change', measure);
  measure();
  eng.rise(window.scrollY < window.innerHeight * 0.4);

  // fetch the close-ups while the reader is still at the top
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(fn) : setTimeout(fn, 1200));
  idle(() => {
    eng.prepareSection();
    // close-up poses stand on the close-up's own ground, so re-aim once they're in
    void Promise.all(cfg.sites.map((s: { slug: string }) => eng.loadPatch(s.slug))).then(() => update());
  });

  // hovering a row flags its stake, wherever the camera is
  document.querySelectorAll<HTMLElement>('[data-station]').forEach((row) => {
    row.addEventListener('pointerenter', () => { document.querySelectorAll('[data-station].is-on').forEach((x) => x.classList.remove('is-on')); row.classList.add('is-on'); });
  });
}

start();
