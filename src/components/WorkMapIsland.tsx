import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface ProjectPoint {
  title: string; slug: string; location?: string; siteType?: string;
  status?: string; lat: number; lng: number;
}
export interface PhotoPoint {
  caption?: string; takenAt?: string; lat: number; lng: number;
}

interface Props {
  projects: ProjectPoint[];
  photos: PhotoPoint[];
  base?: string;
}

const esc = (s = '') =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Field-Atlas status colours.
const STATUS_COLOR: Record<string, string> = {
  active: '#e0a93b',     // hazard amber
  complete: '#57c08a',   // field bright
  proposed: '#8a918a',   // muted
};

export default function WorkMapIsland({ projects, photos, base = '/' }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markers = useRef<{ project: any[]; photo: any[] }>({ project: [], photo: [] });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string>('');
  const [showProjects, setShowProjects] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);

  useEffect(() => {
    let cancelled = false;
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
          style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
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
          el.style.setProperty('--pin', STATUS_COLOR[p.status || ''] || '#57c08a');
          markers.current.project.push(
            new maplibregl.Marker({ element: el })
              .setLngLat([p.lng, p.lat])
              .setPopup(popup(
                `<strong>${esc(p.title)}</strong>` +
                (p.location ? `<span class="wm-pop__loc">${esc(p.location)}</span>` : '') +
                (p.siteType ? `<span class="wm-pop__type">${esc(p.siteType)}</span>` : '') +
                `<a class="wm-pop__link" href="${base}projects/${p.slug}/">View project →</a>`,
              ))
              .addTo(map),
          );
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
          map.fitBounds(b, { padding: 70, maxZoom: 8.5, duration: 0 });
        }
        setReady(true);
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markers.current.project.forEach((m) => { m.getElement().style.display = showProjects ? '' : 'none'; });
  }, [showProjects, ready]);
  useEffect(() => {
    markers.current.photo.forEach((m) => { m.getElement().style.display = showPhotos ? '' : 'none'; });
  }, [showPhotos, ready]);

  return (
    <div className="wm">
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
      <div className="wm__stage">
        <div ref={elRef} className="wm__canvas" aria-hidden={!!failed} />
        {failed && (
          <div className="wm__fallback" role="status">
            <p className="wm__fallback-title">Map unavailable</p>
            <p className="wm__fallback-msg">{failed}</p>
            {projects.length > 0 && (
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
    </div>
  );
}
