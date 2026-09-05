import { useEffect, useRef, useState, type FC } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, X, Crosshair } from 'lucide-react';
import { Button, Input } from '../../ui/primitives';

/**
 * Map picker for a project's approximate location. Click the map (or drag the
 * pin) to set lat/lng; type to fine-tune; Clear to keep the project off the
 * map. MapLibre loads lazily so it costs nothing until a geo entry is open.
 * Precision is deliberately coarse (4 dp here, ~1 km on the public site).
 */
interface Props { lat?: number | null; lng?: number | null; onChange: (lat: number | undefined, lng: number | undefined) => void }
const STYLE = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};
const CA: [number, number] = [-119.7, 37.2];
const theme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
const round = (n: number) => Math.round(n * 1e4) / 1e4;

export const LocationPicker: FC<Props> = ({ lat, lng, onChange }) => {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const has = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        if (disposed || !el.current) return;
        const map = new maplibregl.Map({ container: el.current, style: STYLE[theme()], center: has ? [lng!, lat!] : CA, zoom: has ? 8 : 5, attributionControl: false, cooperativeGestures: true });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.on('click', (e: any) => onChange(round(e.lngLat.lat), round(e.lngLat.lng)));
        map.on('load', () => setReady(true));
        map.on('error', () => setErr('Map tiles could not load. You can still type coordinates.'));
        mapRef.current = map;
        const onTheme = () => { try { map.setStyle(STYLE[theme()]); } catch { /* ignore */ } };
        const mo = new MutationObserver(onTheme);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        (map as any).__mo = mo;
      } catch { setErr('The map could not start here. You can still type coordinates.'); }
    })();
    return () => { disposed = true; try { mapRef.current?.__mo?.disconnect(); mapRef.current?.remove(); } catch { /* fine */ } mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync with the values (from the map, the inputs, or a restore).
  useEffect(() => {
    (async () => {
      const map = mapRef.current; if (!map) return;
      if (!has) { markerRef.current?.remove(); markerRef.current = null; return; }
      const maplibregl = (await import('maplibre-gl')).default;
      if (!markerRef.current) {
        const pin = document.createElement('div'); pin.className = 'locpin'; pin.setAttribute('aria-label', 'Project location');
        markerRef.current = new maplibregl.Marker({ element: pin, draggable: true }).setLngLat([lng!, lat!]).addTo(map);
        markerRef.current.on('dragend', () => { const p = markerRef.current.getLngLat(); onChange(round(p.lat), round(p.lng)); });
      } else markerRef.current.setLngLat([lng!, lat!]);
    })();
  }, [has, lat, lng, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (v: string) => { const t = v.trim(); if (t === '' || t === '-') return undefined; const n = Number(t); return Number.isFinite(n) ? n : undefined; };
  return (
    <div className="loc">
      <div ref={el} className="loc__map" aria-label="Map — click to set the location" />
      <div className="loc__row">
        <label className="loc__field"><span className="sf__label">Lat</span><Input inputMode="decimal" value={lat ?? ''} onChange={(e) => onChange(num(e.target.value), typeof lng === 'number' ? lng : undefined)} placeholder="38.58" aria-label="Latitude" /></label>
        <label className="loc__field"><span className="sf__label">Lng</span><Input inputMode="decimal" value={lng ?? ''} onChange={(e) => onChange(typeof lat === 'number' ? lat : undefined, num(e.target.value))} placeholder="-121.49" aria-label="Longitude" /></label>
        <div className="loc__actions">
          <Button size="sm" variant="ghost" icon={<Crosshair size={14} />} onClick={() => { if (has) mapRef.current?.flyTo({ center: [lng, lat], zoom: 9 }); }} disabled={!has} title="Centre the map on the pin">Centre</Button>
          <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => onChange(undefined, undefined)} disabled={!has}>Clear</Button>
        </div>
      </div>
      <p className="sf__hint"><MapPin size={12} aria-hidden /> {has ? 'Shown on the site at ~1 km precision, so client sites stay approximate.' : 'No pin: this entry stays off the map. Click the map to place one.'}</p>
      {err && <p className="sf__err" role="alert">{err}</p>}
    </div>
  );
};
