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
  const [showProjects, setShowProjects] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !elRef.current) return;

      const map = new maplibregl.Map({
        container: elRef.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        bounds: [[-124.5, 32.4], [-114.1, 42.1]], // California
        fitBoundsOptions: { padding: 40 },
        cooperativeGestures: true, // don't hijack page scroll
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      const popup = (html: string) =>
        new maplibregl.Popup({ offset: 16, closeButton: false, className: 'wm-popup' }).setHTML(html);

      map.on('load', () => {
        if (cancelled) return;

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
      <div ref={elRef} className="wm__canvas" />
    </div>
  );
}
