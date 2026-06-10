/**
 * Minimal YAML-frontmatter (+ markdown body) parser/serializer for the studio.
 * Handles the field shapes our content actually uses: strings, numbers,
 * booleans, dates, string lists, and lists of flat objects. Not a general YAML
 * engine — just enough, predictable, and round-trip-stable.
 */

export interface Doc { data: Record<string, any>; body: string }

/* --------------------------------------------------------------- parsing */
export function parse(raw: string): Doc {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  return { data: parseYaml(m[1]), body: m[2] ?? '' };
}

function parseYaml(src: string): Record<string, any> {
  const lines = src.split(/\r?\n/);
  const out: Record<string, any> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1];
    const val = kv[2];
    if (val === '' ) {
      // could be a block list (lines starting with "  - ")
      const items: any[] = [];
      let j = i + 1;
      // list of objects: "  - name: x"
      if (lines[j] && /^\s*-\s/.test(lines[j])) {
        while (j < lines.length && /^\s*-\s/.test(lines[j])) {
          // object item?
          const first = lines[j].replace(/^\s*-\s*/, '');
          const om = first.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
          if (om) {
            const obj: Record<string, any> = {};
            obj[om[1]] = scalar(om[2]);
            j++;
            while (j < lines.length && /^\s{2,}[A-Za-z0-9_]+:/.test(lines[j]) && !/^\s*-\s/.test(lines[j])) {
              const im = lines[j].match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
              if (im) obj[im[1]] = scalar(im[2]);
              j++;
            }
            items.push(obj);
          } else {
            items.push(scalar(first));
            j++;
          }
        }
        out[key] = items;
        i = j;
        continue;
      }
      out[key] = '';
      i++;
      continue;
    }
    out[key] = scalar(val);
    i++;
  }
  return out;
}

function scalar(v: string): any {
  v = v.trim();
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  // strip surrounding quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  // inline list [a, b]
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => scalar(s)).filter((s) => s !== '');
  }
  return v;
}

/* ------------------------------------------------------------ serializing */
export function stringify(doc: Doc): string {
  const yaml = toYaml(doc.data);
  const body = doc.body ?? '';
  return `---\n${yaml}---\n${body.startsWith('\n') ? body.slice(1) : body}`;
}

function toYaml(data: Record<string, any>): string {
  let out = '';
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) { out += `${k}: []\n`; continue; }
      if (typeof v[0] === 'object') {
        out += `${k}:\n`;
        for (const item of v) {
          const keys = Object.keys(item);
          out += `  - ${keys[0]}: ${fmt(item[keys[0]])}\n`;
          for (const ik of keys.slice(1)) out += `    ${ik}: ${fmt(item[ik])}\n`;
        }
      } else {
        out += `${k}:\n`;
        for (const item of v) out += `  - ${fmt(item)}\n`;
      }
    } else {
      out += `${k}: ${fmt(v)}\n`;
    }
  }
  return out;
}

function fmt(v: any): string {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v ?? '');
  if (s === '') return "''";
  // quote if it has yaml-significant chars
  if (/[:#\[\]{}",&*!|>%@`]/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}
