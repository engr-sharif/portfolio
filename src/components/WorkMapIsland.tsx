import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface ProjectPoint {
  title: string; slug: string; location?: string; siteType?: string;
  status?: string; dates?: string; lat: number; lng: number;
}
export interface PhotoPoint {
  caption?: string; takenAt?: string; lat: number; lng: number;
}

interface Props {
  projects: ProjectPoint[];
  photos: PhotoPoint[];
  base?: string;
  /**
   * 'atlas' — the homepage Field Atlas: the map plus a synced list of sites
   *           (hover/focus a row → the pin lights up and the map eases to it;
   *           hover a pin → the row lights up).
   * 'compact' — the map alone (About page).
   */
  variant?: 'atlas' | 'compact';
}

const esc = (s = '') =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Field-Atlas status colours as CSS tokens → they follow the theme.
const STATUS_VAR: Record<string, string> = {
  active: 'var(--color-hazard)',
  complete: 'var(--color-field-bright)',
  proposed: 'var(--color-muted)',
};

// CARTO basemaps: dark matter for Field, positron for Lab.
const STYLE: Record<string, string> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};
const themeNow = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export default function WorkMapIsland({ projects, photos, base = '/', variant = 'compact' }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markers = useRef<{ project: Map<string, any>; photo: any[] }>({ project: new Map(), photo: [] });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string>('');
  const [showProjects, setShowProjects] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const isAtlas = variant === 'atlas';

  useEffect(() => {
    let cancelled = false;
    let onTheme: (() => void) | null = null;
    (async () => {
      let maplibregl: any;
      try {
        maplibregl = (await import('maplibre-gl')).default;
      } catch {
        if (!cancelled) setFailed('The map library could not be loaded.');
        return;
      }
      if (cancelled || !elRef.current) return;
      if (typeof maplibregl.supported === 'function' && !maplibregl.supported()) {
        setFailed('This browser can’t render WebGL maps.');
        return;
      }

      let map: any;
      try {
        map = new maplibregl.Map({
          container: elRef.current,
          style: STYLE[themeNow()],
          bounds: [[-124.5, 32.4], [-114.1, 42.1]], // California
          fitBoundsOptions: { padding: 40 },
          cooperativeGestures: true, // don't hijack page scroll
          attributionControl: { compact: true },
        });
      } catch {
        if (!cancelled) setFailed('The map could not be started on this device.');
        return;
      }
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // Basemap/tiles blocked (offline, corporate proxy, ad-blocker) → say so
      // instead of leaving a silent black rectangle. Only style-level failures
      // count; a single missing tile is normal and non-fatal.
      let loaded = false;
      map.on('error', (e: any) => {
        if (cancelled || loaded) return;
        const msg = String(e?.error?.message || e?.error || '');
        const isStyle = !e?.tile && (/style|Failed to fetch|NetworkError|403|404|5\d\d/i.test(msg) || !map.isStyleLoaded?.());
        if (isStyle) setFailed('The basemap could not be loaded — it may be blocked on this network.');
      });

      const popup = (html: string) =>
        new maplibregl.Popup({ offset: 16, closeButton: false, className: 'wm-popup' }).setHTML(html);

      map.on('load', () => {
        if (cancelled) return;
        loaded = true;

        projects.forEach((p) => {
          const el = document.createElement('div');
          el.className = 'wm-pin wm-pin--project';
          el.style.setProperty('--pin', STATUS_VAR[p.status || ''] || STATUS_VAR.complete);
          el.dataset.slug = p.slug;
          if (isAtlas) {
            el.addEventListener('pointerenter', () => setActive(p.slug));
            el.addEventListener('pointerleave', () => setActive(null));
          }
          const m = new maplibregl.Marker({ element: el })
            .setLngLat([p.lng, p.lat])
            .setPopup(popup(
              `<strong>${esc(p.title)}</strong>` +
              (p.location ? `<span class="wm-pop__loc">${esc(p.location)}</span>` : '') +
              (p.siteType ? `<span class="wm-pop__type">${esc(p.siteType)}</span>` : '') +
              `<a class="wm-pop__link" href="${base}projects/${p.slug}/">View project →</a>`,
            ))
            .addTo(map);
          markers.current.project.set(p.slug, m);
        });

        photos.forEach((p) => {
          const el = document.createElement('div');
          el.className = 'wm-pin wm-pin--photo';
          markers.current.photo.push(
            new maplibregl.Marker({ element: el })
              .setLngLat([p.lng, p.lat])
              .setPopup(popup(
                `<strong>Field photo</strong>` +
                (p.caption ? `<span class="wm-pop__loc">${esc(p.caption)}</span>` : '') +
                (p.takenAt ? `<span class="wm-pop__type">${esc(p.takenAt)}</span>` : ''),
              ))
              .addTo(map),
          );
        });

        const all = [...projects, ...photos];
        if (all.length) {
          const b = new maplibregl.LngLatBounds();
          all.forEach((p) => b.extend([p.lng, p.lat]));
          map.fitBounds(b, { padding: isAtlas ? 60 : 70, maxZoom: 8.5, duration: 0 });
        }
        setReady(true);
      });

      // Theme switch → swap the basemap. DOM markers survive setStyle.
      onTheme = () => { try { map.setStyle(STYLE[themeNow()]); } catch { /* ignore */ } };
      window.addEventListener('themechange', onTheme);
    })();
    return () => {
      cancelled = true;
      if (onTheme) window.removeEventListener('themechange', onTheme);
      mapRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markers.current.project.forEach((m) => { m.getElement().style.display = showProjects ? '' : 'none'; });
  }, [showProjects, ready]);
  useEffect(() => {
    markers.current.photo.forEach((m) => { m.getElement().style.display = showPhotos ? '' : 'none'; });
  }, [showPhotos, ready]);

  // Atlas sync: highlight the active pin and ease the map toward it.
  useEffect(() => {
    if (!isAtlas || !ready) return;
    markers.current.project.forEach((m, slug) => m.getElement().classList.toggle('is-active', slug === active));
    const map = mapRef.current;
    const m = active ? markers.current.project.get(active) : null;
    if (map && m && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      map.easeTo({ center: m.getLngLat(), duration: 600, essential: false });
    }
  }, [active, ready, isAtlas]);

  const legend = (
    <div className="wm__legend">
      <button type="button" aria-pressed={showProjects} className={`wm__toggle${showProjects ? ' is-on' : ''}`} onClick={() => setShowProjects((v) => !v)}>
        <span className="wm__swatch wm__swatch--project" /> Project sites ({projects.length})
      </button>
      {photos.length > 0 && (
        <button type="button" aria-pressed={showPhotos} className={`wm__toggle${showPhotos ? ' is-on' : ''}`} onClick={() => setShowPhotos((v) => !v)}>
          <span className="wm__swatch wm__swatch--photo" /> Field photos ({photos.length})
        </button>
      )}
      <span className="wm__note">Locations approximate</span>
    </div>
  );

  const stage = (
    <div className="wm__stage">
      <div ref={elRef} className="wm__canvas" aria-hidden={!!failed} />
      {failed && (
        <div className="wm__fallback" role="status">
          <p className="wm__fallback-title">Map unavailable</p>
          <p className="wm__fallback-msg">{failed}</p>
          {!isAtlas && projects.length > 0 && (
            <ul className="wm__fallback-list">
              {projects.map((p) => (
                <li key={p.slug}>
                  <a href={`${base}projects/${p.slug}/`}>{p.title}</a>
                  {p.location && <span> · {p.location}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!failed && !ready && <div className="wm__loading" aria-hidden="true" />}
    </div>
  );

  if (!isAtlas) {
    return (
      <div className="wm">
        {legend}
        {stage}
      </div>
    );
  }

  return (
    <div className="wm wm--atlas">
      <ol className="atlas__list" aria-label="Project sites">
        {projects.map((p, i) => (
          <li key={p.slug} className={`atlas__row${active === p.slug ? ' is-active' : ''}`}>
            <a
              href={`${base}projects/${p.slug}/`}
              className="atlas__link"
              onPointerEnter={() => setActive(p.slug)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(p.slug)}
              onBlur={() => setActive(null)}
            >
              <span className="atlas__index u-mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="atlas__main">
                <span className="atlas__title">{p.title}</span>
                <span className="atlas__meta u-mono">
                  {p.location || 'California'}{p.siteType ? ` · ${p.siteType}` : ''}
                </span>
              </span>
              <span className="atlas__side">
                <span className={`status status--${p.status || 'complete'}`}>{p.status || 'complete'}</span>
                {p.dates && <span className="atlas__dates u-mono">{p.dates}</span>}
              </span>
              <span className="atlas__arrow" aria-hidden="true">→</span>
            </a>
          </li>
        ))}
      </ol>
      <div className="atlas__map">
        {legend}
        {stage}
      </div>
    </div>
  );
}
