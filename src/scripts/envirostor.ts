/**
 * Live regulatory record from California's EnviroStor (DTSC) public ArcGIS
 * dataset — official data, no key, fetched in the browser. The badge stays
 * hidden until a record arrives, and simply never appears if the service is
 * unreachable.
 */
const ENDPOINT = 'https://services3.arcgis.com/Oy2JTCD10wkoelxS/arcgis/rest/services/Envirostor_Public_Data_Export/FeatureServer/0/query';
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function initEnviroStor() {
  document.querySelectorAll<HTMLElement>('[data-envirostor]').forEach(async (el) => {
    const q = (el.dataset.envirostor || '').toUpperCase().replace(/'/g, '');
    if (!q) return;
    const where = `UPPER(project_name) LIKE '%${q}%'`;
    const url = `${ENDPOINT}?where=${encodeURIComponent(where)}&outFields=site_type,status,national_priorities_list,county&returnGeometry=false&f=json`;
    try {
      const d = await (await fetch(url)).json();
      const f = d?.features?.[0]?.attributes;
      if (!f) return;
      const set = (k: string, v: string) => { const n = el.querySelector(`[data-f="${k}"]`); if (n) n.textContent = v; };
      set('program', f.site_type || '—');
      set('status', f.status || '—');
      set('npl', f.national_priorities_list === 'YES' ? 'On the National Priorities List' : (f.national_priorities_list || '—'));
      set('county', f.county ? title(f.county) : '—');
      el.hidden = false;
    } catch { /* stays hidden */ }
  });
}
