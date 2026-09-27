/**
 * A report's key map, live: the same ground as the home page, focused on one
 * site. It arrives the way the home page left it — the page transition morphs
 * the full-screen map into this panel — then descends from the statewide view
 * onto the site's own 40 km of terrain and settles. Drag to turn it; it eases
 * back after a moment. The drawn locator underneath stays as the still and as
 * the fallback without WebGL.
 */
import { createGround, type Station, type Site } from './engine';

interface KeymapConfig { groundUrl: string; bbox: { west: number; east: number; south: number; north: number }; station: Station; site: Site }

const CLOSE_RELIEF = 0.42;

async function mount(el: HTMLElement) {
  const cfg = JSON.parse(el.dataset.cfg || '{}') as KeymapConfig;
  const hud = el.querySelector<HTMLElement>('[data-keymap-hud]');
  let eng;
  try {
    eng = await createGround({
      root: el, canvas: el.querySelector('canvas')!, overlay: el.querySelector('.locator__ov')!,
      groundUrl: cfg.groundUrl, bbox: cfg.bbox, stations: [cfg.station], sites: [cfg.site],
      interactive: true,
      onFrame: (f) => { if (hud) hud.textContent = `${f.scaleKm} km · vertical ×${Math.round(f.exaggeration)}`; },
    });
  } catch { eng = null; }
  if (!eng) return; // the drawn locator stays
  el.classList.remove('is-live'); // show only once the close-up is ready
  await eng.loadPatch(cfg.site.slug);
  const p = eng.world.toPlane(cfg.site.lat, cfg.site.lng);
  const e = eng.siteElev(cfg.site.slug);
  const span = ((cfg.site.north - cfg.site.south) * 111.32) / 40;
  const scene = { patch: cfg.site.slug, focus: cfg.site.slug, stakes: 1 };
  eng.setGoal({ tx: p.x, ty: e * 1.05, tz: p.z + 0.4, dist: 7.5, pitch: 1.25, yaw: 0, sx: 0, sy: 0 }, { ...scene, relief: 1.05, patchW: 0 }, { snap: true });
  el.classList.add('is-live');
  requestAnimationFrame(() => {
    eng!.setGoal({ tx: p.x, ty: e * CLOSE_RELIEF, tz: p.z, dist: 0.62 * span, pitch: 0.6, yaw: -0.45, sx: 0, sy: -0.06 }, { ...scene, relief: CLOSE_RELIEF, patchW: 1 }, { k: 1.8 });
  });
}

document.querySelectorAll<HTMLElement>('[data-keymap]').forEach((el) => {
  // start only when the key map is near the screen
  const io = new IntersectionObserver((entries) => {
    if (entries.some((x) => x.isIntersecting)) { io.disconnect(); void mount(el); }
  }, { rootMargin: '200px' });
  io.observe(el);
});
