/**
 * The last look before something goes live: a rule-based read of an entry for
 * the things an environmental consultant must not publish by accident —
 * precise coordinates, lab results, street addresses, parcel numbers, phone
 * numbers, and any name on the owner's watch list (clients, sites, people).
 *
 * It is a checklist, not a judge: every finding can be published anyway,
 * because a regulatory limit ("an MCL of 4 ng/L") looks exactly like a result.
 * What it guarantees is that nothing goes live unread.
 *
 * The watch list lives in the (public) repo, so it is stored as salted SHA-256
 * hashes of normalised phrases: the file does not list the names, and the scan
 * hashes every run of 1–N words in the entry to compare. That hides the list
 * from a casual reader; it would not stop someone guessing a specific name.
 */

export type FindingKind = 'watch' | 'coords' | 'result' | 'address' | 'parcel' | 'phone';

export interface Finding {
  kind: FindingKind;
  field: string;          // "body" or a frontmatter field name
  match: string;
  before: string;
  after: string;
}

export const KIND_INFO: Record<FindingKind, { title: string; why: string }> = {
  watch: { title: 'Name on your watch list', why: 'You marked this name as not cleared for public sharing.' },
  coords: { title: 'Precise coordinates', why: 'Four or more decimal places pin a spot to within about 10 m. The site rounds map positions for you; text is not rounded.' },
  result: { title: 'Lab result', why: 'A concentration with units. Fine if it is a published limit (an MCL, an ESL); not if it is a client’s data.' },
  address: { title: 'Street address', why: 'Addresses identify a property and its owner.' },
  parcel: { title: 'Parcel number', why: 'An APN identifies a property as surely as an address.' },
  phone: { title: 'Phone number', why: 'Personal contact details do not belong in a write-up.' },
};

const RULES: { kind: Exclude<FindingKind, 'watch'>; re: RegExp }[] = [
  // decimal degrees with ≥4 places, or degrees-minutes-seconds
  { kind: 'coords', re: /-?\b\d{1,3}\.\d{4,}\b|\b\d{1,3}°\s?\d{1,2}['′]\s?\d{1,2}(?:\.\d+)?["″]?/g },
  { kind: 'result', re: /\b\d[\d,]*(?:\.\d+)?\s?(?:mg\/kg|mg\/L|[µμu]g\/L|[µμu]g\/kg|[µμu]g\/m(?:3|³)|mg\/m(?:3|³)|ng\/L|ng\/kg|pCi\/L|pCi\/g|ppm|ppb|ppt)(?![\w/])/gi },
  { kind: 'address', re: /\b\d{2,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][A-Za-z]+\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Highway|Hwy|Parkway|Pkwy|Place|Pl|Circle|Cir)\b\.?/g },
  { kind: 'parcel', re: /\bAPNs?\s*[:#]?\s*\d[\d-]{5,}|\b\d{3}-\d{3}-\d{2,3}\b(?!-)/g },
  { kind: 'phone', re: /(?:\+1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
];

/** Fields that hold paths, ids or numbers the site already handles safely. */
const SKIP_FIELDS = new Set(['lat', 'lng', 'audioPeaks', 'peaks', 'privacy', 'order', 'status', 'clearance']);
const looksLikeRef = (s: string) => /^(?:\/|https?:\/\/|src\/|public\/|\.\.?\/)/.test(s.trim());

const CONTEXT = 36;
function excerpt(text: string, start: number, end: number) {
  const b = text.slice(Math.max(0, start - CONTEXT), start);
  const a = text.slice(end, end + CONTEXT);
  return { before: (start > CONTEXT ? '…' : '') + b.replace(/\s+/g, ' '), after: a.replace(/\s+/g, ' ') + (end + CONTEXT < text.length ? '…' : '') };
}

/** Markdown/HTML noise out, so links and image paths don't trip the rules. */
function readable(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length)) // code is code, not a disclosure
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (m, alt) => alt + ' '.repeat(m.length - alt.length))
    .replace(/\]\([^)]*\)/g, (m) => ']' + ' '.repeat(m.length - 1))
    .replace(/<[^>]+>/g, (m) => ' '.repeat(m.length));
}

export function scanText(text: string, field: string): Finding[] {
  const out: Finding[] = [];
  const src = field === 'body' ? readable(text) : text;
  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(src)); ) {
      out.push({ kind, field, match: text.slice(m.index, m.index + m[0].length), ...excerpt(text, m.index, m.index + m[0].length) });
    }
  }
  // one span, one finding: keep the first rule that claimed it
  return out.filter((f, i) => out.findIndex((g) => g.field === f.field && g.match === f.match && g.before === f.before) === i);
}

/* ------------------------------------------------------------ watch list */

export interface WatchList { version: 1; salt: string; maxWords: number; hashes: string[] }
export const EMPTY_WATCHLIST: WatchList = { version: 1, salt: 'ground-truth', maxWords: 1, hashes: [] };

/** Lower case, accents off, punctuation to spaces: "Café-Ltd." → "cafe ltd". */
export const normalise = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const hashTerm = (list: Pick<WatchList, 'salt'>, term: string) => sha256(`${list.salt}\u0000${normalise(term)}`);

/** Add or remove a phrase; returns a new list (or the same one if nothing changed). */
export async function withTerm(list: WatchList, term: string, remove = false): Promise<WatchList> {
  const n = normalise(term);
  if (!n) return list;
  const h = await hashTerm(list, n);
  const has = list.hashes.includes(h);
  if (remove ? !has : has) return list;
  const hashes = remove ? list.hashes.filter((x) => x !== h) : [...list.hashes, h].sort();
  return { ...list, hashes, maxWords: Math.max(remove ? 1 : list.maxWords, n.split(' ').length) };
}

/** Every run of 1..maxWords words, with where it sits in the original text. */
function phrases(text: string, maxWords: number) {
  const words: { w: string; start: number; end: number }[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  for (let m; (m = re.exec(text)); ) {
    const w = normalise(m[0]);
    if (w) words.push({ w, start: m.index, end: m.index + m[0].length });
  }
  const out: { phrase: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    let phrase = '';
    for (let n = 0; n < maxWords && i + n < words.length; n++) {
      phrase = n ? `${phrase} ${words[i + n].w}` : words[i].w;
      out.push({ phrase, start: words[i].start, end: words[i + n].end });
    }
  }
  return out;
}

export async function scanWatch(text: string, field: string, list: WatchList): Promise<Finding[]> {
  if (!list.hashes.length || !text) return [];
  const set = new Set(list.hashes);
  const out: Finding[] = [];
  const cache = new Map<string, boolean>();
  for (const p of phrases(text, list.maxWords)) {
    let hit = cache.get(p.phrase);
    if (hit === undefined) { hit = set.has(await sha256(`${list.salt}\u0000${p.phrase}`)); cache.set(p.phrase, hit); }
    if (hit) out.push({ kind: 'watch', field, match: text.slice(p.start, p.end), ...excerpt(text, p.start, p.end) });
  }
  return out;
}

/* ------------------------------------------------------------ an entry */

function strings(value: unknown, field: string, out: { field: string; text: string }[]) {
  if (typeof value === 'string') { if (!looksLikeRef(value)) out.push({ field, text: value }); }
  else if (Array.isArray(value)) value.forEach((v) => strings(v, field, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, field === k ? k : `${field}.${k}`, out);
}

/** Findings for an entry's fields and body, ordered by where they appear. */
export async function scanEntry(data: Record<string, unknown>, body: string, list: WatchList = EMPTY_WATCHLIST): Promise<Finding[]> {
  const parts: { field: string; text: string }[] = [];
  for (const [k, v] of Object.entries(data)) if (!SKIP_FIELDS.has(k)) strings(v, k, parts);
  if (body) parts.push({ field: 'body', text: body });
  const out: Finding[] = [];
  for (const p of parts) {
    out.push(...(await scanWatch(p.text, p.field, list)));
    out.push(...scanText(p.text, p.field));
  }
  return out;
}
