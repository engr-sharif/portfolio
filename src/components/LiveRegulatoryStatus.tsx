/**
 * Live regulatory status, fetched client-side from California's EnviroStor
 * (DTSC) public ArcGIS dataset — official cleanup-program data, no API key,
 * CORS-enabled. Renders a verifiable status badge for a real site (e.g.
 * "Sulphur Bank Mercury Mine → Federal Superfund · Active · NPL: YES").
 *
 * Fails silently: if the API is unreachable or returns nothing, the component
 * renders nothing — it never blocks or breaks the page.
 */
import { useEffect, useState, type FC } from 'react';

interface Props { query: string }

interface Record {
  site_type: string;
  status: string;
  national_priorities_list: string;
  county: string;
}

const ENDPOINT =
  'https://services3.arcgis.com/Oy2JTCD10wkoelxS/arcgis/rest/services/Envirostor_Public_Data_Export/FeatureServer/0/query';

const LiveRegulatoryStatus: FC<Props> = ({ query }) => {
  const [rec, setRec] = useState<Record | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    let cancelled = false;
    const where = `UPPER(project_name) LIKE '%${query.toUpperCase().replace(/'/g, '')}%'`;
    const url =
      `${ENDPOINT}?where=${encodeURIComponent(where)}` +
      `&outFields=site_type,status,national_priorities_list,county&returnGeometry=false&f=json`;

    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const f = d?.features?.[0]?.attributes;
        if (f) { setRec(f); setState('ok'); } else { setState('fail'); }
      })
      .catch(() => !cancelled && setState('fail'));
    return () => { cancelled = true; };
  }, [query]);

  if (state === 'fail') return null;

  return (
    <div className={`livereg${state === 'ok' ? ' is-loaded' : ''}`} aria-live="polite">
      <div className="livereg__head">
        <span className="livereg__dot" aria-hidden="true" />
        <span className="livereg__src">Live · CA EnviroStor (DTSC)</span>
      </div>
      {state === 'loading' && <p className="livereg__loading">Querying state record…</p>}
      {rec && (
        <dl className="livereg__grid">
          <div><dt>Program</dt><dd>{rec.site_type}</dd></div>
          <div><dt>Status</dt><dd>{rec.status}</dd></div>
          <div><dt>NPL</dt><dd>{rec.national_priorities_list === 'YES' ? 'On the National Priorities List' : rec.national_priorities_list}</dd></div>
          <div><dt>County</dt><dd>{titleCase(rec.county)}</dd></div>
        </dl>
      )}
    </div>
  );
};

const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0] + w.slice(1).toLowerCase());

export default LiveRegulatoryStatus;
