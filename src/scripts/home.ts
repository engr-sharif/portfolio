/**
 * Home: wires the terrain to the reading position. Wide screens only — on a
 * phone the map is a single still view between the opening and the list.
 *
 *   opening in view         → oblique opening view
 *   atlas heading arrives   → plan view of the state
 *   a site row at mid-screen → fly to that site, flag it
 *   leaving the atlas       → cut the section
 */
import { createTerrain, type Terrain } from './terrain/index';

const root = document.querySelector<HTMLElement>('[data-terrain]');
const wide = matchMedia('(min-width: 64rem)');

async function start() {
  if (!root) return;
  let terrain: Terrain | null = null;
  try { terrain = await createTerrain(root); } catch { terrain = null; }
  if (!terrain) { root.classList.add('is-static'); return; }
  const t = terrain;
  const state = document.querySelector<HTMLElement>('[data-terrain-state]');
  const rows = [...document.querySelectorAll<HTMLElement>('[data-station]')];
  const stations = JSON.parse(root.dataset.stations || '[]') as { slug: string; lat: number; lng: number; no: string }[];
  const say = (s: string) => { viewText = s; if (state && !state.classList.contains('is-lens')) state.textContent = s; };

  // Coordinate lens: the HUD shows the position under the pointer, then goes
  // back to describing the current view.
  let viewText = state?.textContent ?? '';
  root.addEventListener('terrain:lens', (e) => {
    if (!state) return;
    const d = (e as CustomEvent<{ lat: number; lng: number } | null>).detail;
    state.textContent = d ? `${d.lat.toFixed(2)}° N ${Math.abs(d.lng).toFixed(2)}° W` : viewText;
    state.classList.toggle('is-lens', !!d);
  });

  let mode = '';
  const go = (next: string, slug?: string) => {
    const key = slug ? `${next}:${slug}` : next;
    if (key === mode) return;
    mode = key;
    t.fly(next as 'opening' | 'plan' | 'site', slug);
    rows.forEach((r) => r.classList.toggle('is-on', r.dataset.station === slug));
    if (next === 'site' && slug) {
      const s = stations.find((x) => x.slug === slug);
      if (s) say(`Site ${s.no} · ${s.lat.toFixed(2)}° N ${Math.abs(s.lng).toFixed(2)}° W`);
    } else if (next === 'plan') say('Plan view · 5 projects');
    else say('Relief 0 – 4,400 m');
  };

  // Hover or focus on a row flags its stake, on any screen.
  rows.forEach((r) => {
    const slug = r.dataset.station!;
    r.addEventListener('pointerenter', () => t.highlight(slug));
    r.addEventListener('focusin', () => t.highlight(slug));
  });

  if (!wide.matches) return;

  const opening = document.querySelector<HTMLElement>('.opening');
  const head = document.querySelector<HTMLElement>('#atlas .sec-head');
  const sentinel = document.querySelector<HTMLElement>('[data-cut-sentinel]');
  const centre = { rootMargin: '-48% 0px -48% 0px' };

  const pick = () => {
    const mid = window.innerHeight / 2;
    // the last marker whose top is above the middle of the screen wins
    let next: { m: string; slug?: string } = { m: 'opening' };
    if (head && head.getBoundingClientRect().top < mid) next = { m: 'plan' };
    for (const r of rows) if (r.getBoundingClientRect().top < mid) next = { m: 'site', slug: r.dataset.station };
    if (opening && opening.getBoundingClientRect().bottom > mid) next = { m: 'opening' };
    go(next.m, next.slug);
    if (sentinel) t.cut(sentinel.getBoundingClientRect().top < mid * 1.2);
  };
  const io = new IntersectionObserver(pick, centre);
  [opening, head, sentinel, ...rows].forEach((el) => el && io.observe(el));
  let raf = 0;
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); }, { passive: true });
  pick();
}

start();
