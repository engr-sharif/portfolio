/**
 * The depth rail: reads the page's [data-stratum] sections, draws them as the
 * layers of a boring log (height proportional to the section's length, filled
 * with its lithology pattern), and tracks the reader's depth — scroll position
 * mapped onto the log's total depth in feet below ground surface. On phones the
 * same progress drives the thin depth bar under the nav.
 */
const SVG = 'http://www.w3.org/2000/svg';
const PATTERNS = ['lith-topsoil', 'lith-silty-sand', 'lith-clay', 'lith-sand', 'lith-silt', 'lith-gravel', 'lith-sand', 'lith-silty-sand', 'lith-clay', 'lith-rock'];
const CODES = ['OL', 'SM', 'CL', 'SP', 'ML', 'GP', 'SW', 'SM', 'CH', 'BR'];

export function initRail() {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  const svg = rail?.querySelector<SVGSVGElement>('[data-rail-svg]');
  const names = rail?.querySelector<HTMLElement>('[data-rail-names]');
  const tick = rail?.querySelector<HTMLElement>('[data-rail-tick]');
  const readout = rail?.querySelector<HTMLElement>('[data-rail-depth]');
  const bar = document.querySelector<HTMLElement>('[data-depthbar]');
  if (!rail || !svg || !names || !tick || !readout) return;

  const total = Number(rail.dataset.total) || 42.5;
  const strata = [...document.querySelectorAll<HTMLElement>('[data-stratum]')];
  if (!strata.length) return;
  let bounds: { el: HTMLElement; top: number; bottom: number; link?: HTMLAnchorElement }[] = [];
  let colH = 0;

  const layout = () => {
    const docH = document.documentElement.scrollHeight;
    bounds = strata.map((el, i) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const next = strata[i + 1];
      const bottom = next ? next.getBoundingClientRect().top + window.scrollY : docH;
      return { el, top, bottom };
    });
    colH = svg.clientHeight || rail.clientHeight;
    svg.setAttribute('viewBox', `0 0 36 ${colH}`);
    svg.replaceChildren();
    names.replaceChildren();
    let lastLabel = -99;
    const span = Math.max(1, docH - bounds[0].top);
    bounds.forEach((b, i) => {
      const y0 = ((b.top - bounds[0].top) / span) * colH;
      const y1 = ((b.bottom - bounds[0].top) / span) * colH;
      const r = document.createElementNS(SVG, 'rect');
      r.setAttribute('x', '4');
      r.setAttribute('width', '28');
      r.setAttribute('y', y0.toFixed(1));
      r.setAttribute('height', Math.max(1, y1 - y0).toFixed(1));
      r.setAttribute('fill', `url(#${b.el.dataset.pattern || PATTERNS[i % PATTERNS.length]})`);
      r.setAttribute('stroke', 'currentColor');
      r.setAttribute('stroke-width', '0.6');
      svg.append(r);
      const a = document.createElement('a');
      a.className = 'rail__name';
      a.href = `#${b.el.id}`;
      const ly = Math.max(y0, lastLabel + 30);
      lastLabel = ly;
      a.style.top = `${ly.toFixed(1)}px`;
      const depth = ((y0 / colH) * total).toFixed(1);
      const code = b.el.dataset.code || CODES[i % CODES.length];
      a.innerHTML = `<b>${code} · ${depth}</b>`;
      a.append(document.createTextNode(b.el.dataset.stratum || ''));
      names.append(a);
      b.link = a;
    });
    update();
  };

  let raf = 0;
  const update = () => {
    raf = 0;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const p = Math.min(1, Math.max(0, window.scrollY / max));
    readout.textContent = (p * total).toFixed(1);
    tick.style.setProperty('--y', `${(p * colH).toFixed(1)}px`);
    if (bar) bar.style.setProperty('--p', p.toFixed(4));
    const probe = window.scrollY + window.innerHeight * 0.35;
    let cur = bounds[0];
    for (const b of bounds) if (probe >= b.top) cur = b;
    for (const b of bounds) {
      const on = b === cur;
      b.link?.classList.toggle('is-on', on);
      if (on) b.link?.setAttribute('aria-current', 'location'); else b.link?.removeAttribute('aria-current');
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  window.addEventListener('scroll', schedule, { passive: true });
  new ResizeObserver(() => layout()).observe(document.body);
  document.fonts?.ready.then(layout);
  layout();
}
