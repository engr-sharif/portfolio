/**
 * In-memory stand-in for the Studio Worker, seeded from the repo's REAL content
 * (via import.meta.glob at build time), so every screen can be driven without
 * credentials or a network: the e2e suite runs against it in CI, and
 * `/studio/?mock=1` lets anyone try the admin safely. Writes go to memory only.
 *
 * It mirrors the Worker's contract byte-for-byte where the UI depends on it:
 * shas, 409 conflicts, /api/commit atomicity, history + ref reads, 401 gate.
 * Small artificial latency keeps loading states honest.
 */
type Files = Map<string, string>;
interface Commit { sha: string; message: string; date: string; author: string; changes: Map<string, string | null> }

const files: Files = new Map();
const assets = new Set<string>();
const commits: Commit[] = [];
let seeded: Promise<void> | null = null;
let clock = Date.now() - 1000 * 60 * 60 * 24 * 40; // history starts ~40 days ago
const TOKEN = 'mock-session-token';
export const MOCK_PASSWORD = 'mock';

const hash = (s: string) => {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193); h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x811c9dc5); }
  const a = (h1 >>> 0).toString(16).padStart(8, '0'), b = (h2 >>> 0).toString(16).padStart(8, '0');
  return (a + b + a + b + a).slice(0, 40);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function seed(): Promise<void> {
  if (seeded) return seeded;
  seeded = (async () => {
    const content = import.meta.glob('/src/content/**/*.{md,json}', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
    const entries = await Promise.all(Object.entries(content).map(async ([k, load]) => [k.replace(/^\//, ''), await load()] as const));
    for (const [p, c] of entries) files.set(p, c);
    const imgs = import.meta.glob('/src/assets/**/*.{jpg,jpeg,png,webp,avif,gif,svg}', { query: '?url', import: 'default' });
    for (const k of Object.keys(imgs)) assets.add(k.replace(/^\//, ''));
    for (const p of ['public/resume/Sharif_Resume.pdf', 'public/og-image.png']) assets.add(p);
    // A plausible history: one commit per content file, spread over the past weeks.
    const sorted = [...files.keys()].sort();
    for (const p of sorted) record(`studio: create ${p.split('/').pop()?.replace(/\.(md|json)$/, '')}`, new Map([[p, files.get(p)!]]), 'Nawaz', true);
  })();
  return seeded;
}

function record(message: string, changes: Map<string, string | null>, author = 'Studio (mock)', backdate = false) {
  if (backdate) clock += 1000 * 60 * 60 * (18 + Math.floor(Math.random() * 30));
  const date = new Date(backdate ? clock : Date.now()).toISOString();
  const sha = hash(message + date + [...changes.keys()].join(','));
  commits.push({ sha, message, date, author, changes });
  return sha;
}

function fileAt(path: string, ref: string): string | null | undefined {
  const idx = commits.findIndex((c) => c.sha === ref || c.sha.startsWith(ref));
  if (idx < 0) return undefined;
  let val: string | null | undefined;
  for (let i = 0; i <= idx; i++) if (commits[i].changes.has(path)) val = commits[i].changes.get(path);
  return val;
}

const TASK_REPLY: Record<string, (t: string) => string> = {
  polish: (t) => t.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()).replace(/\bwas fine\b/g, 'were within expected ranges'),
  grammar: (t) => t.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()),
  summarize: (t) => (t.replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0] || '').slice(0, 160),
  expand: (t) => t.split(/\n+/).filter(Boolean).map((l) => l.replace(/^[-*]\s*/, '')).map((l) => `${l.replace(/\.?$/, '')}. This step followed the site's standard field procedure and was documented in the daily log.`).join('\n\n'),
  alt: () => 'A field technician holds a handheld instrument over a marked sampling grid on bare soil.',
  caption: () => 'Handheld XRF screening across the sampling grid before confirmation samples were collected.',
};

export async function mockFetch(input: string, init: RequestInit = {}): Promise<Response> {
  await seed();
  const url = new URL(input.replace(/^mock:\/\/studio/, 'https://mock.local'));
  const method = (init.method || 'GET').toUpperCase();
  const path = url.pathname;
  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};
  const auth = (init.headers as Record<string, string> | undefined)?.Authorization || '';
  await sleep(method === 'GET' ? 90 + Math.random() * 160 : 220 + Math.random() * 300);

  if (path === '/api/login' && method === 'POST') {
    if (body.password !== MOCK_PASSWORD) return json({ error: 'Invalid password' }, 401);
    return json({ token: TOKEN, expiresIn: 60 * 60 * 8 });
  }
  if (auth !== `Bearer ${TOKEN}`) return json({ error: 'Unauthorized' }, 401);

  if (path === '/api/status') return json({ ok: true, repo: 'engr-sharif/portfolio', branch: 'main', mock: true });
  if (path === '/api/deploy-status') {
    const last = commits[commits.length - 1];
    return json({ state: 'live', url: 'https://dash.cloudflare.com/', at: last?.date });
  }
  if (path === '/api/file' && method === 'GET') {
    const p = url.searchParams.get('path') || '';
    const ref = url.searchParams.get('ref');
    if (!/^[A-Za-z0-9_.\/-]+$/.test(p)) return json({ error: 'A valid repo path is required' }, 400);
    if (ref) { const v = fileAt(p, ref); return json(v == null ? { content: null, sha: null, ref } : { content: v, sha: hash(v), ref }); }
    const c = files.get(p);
    if (c === undefined) return assets.has(p) ? json({ content: '', sha: hash(p) }) : json({ content: null, sha: null, ref: 'main' });
    return json({ content: c, sha: hash(c), ref: 'main' });
  }
  if (path === '/api/file' && method === 'PUT') {
    const { path: p, content, message, sha } = body;
    if (typeof p !== 'string' || typeof content !== 'string') return json({ error: 'path and content are required' }, 400);
    const cur = files.get(p);
    if (cur !== undefined && sha && hash(cur) !== sha) return json({ error: 'conflict', detail: 'This file changed since you opened it. Reload the entry and re-apply your edits.' }, 409);
    if (cur === undefined && sha) return json({ error: 'conflict', detail: 'This file no longer exists.' }, 409);
    files.set(p, content);
    const commit = record(String(message || `studio: update ${p}`), new Map([[p, content]]));
    return json({ ok: true, sha: hash(content), commit });
  }
  if (path === '/api/file' && method === 'DELETE') {
    const { path: p, sha, message } = body;
    const cur = files.get(p);
    if (cur === undefined) return json({ error: 'Not found' }, 404);
    if (sha && hash(cur) !== sha) return json({ error: 'conflict', detail: 'This file changed since you opened it.' }, 409);
    files.delete(p);
    const commit = record(String(message || `studio: delete ${p}`), new Map([[p, null]]));
    return json({ ok: true, commit });
  }
  if (path === '/api/list' && method === 'GET') {
    const dir = (url.searchParams.get('dir') || '').replace(/\/$/, '');
    const out = new Map<string, { name: string; path: string; sha: string; type: string }>();
    for (const p of [...files.keys(), ...assets]) {
      if (!p.startsWith(dir + '/')) continue;
      const rest = p.slice(dir.length + 1);
      const name = rest.split('/')[0];
      const isDir = rest.includes('/');
      out.set(name, { name, path: `${dir}/${name}`, sha: hash(p), type: isDir ? 'dir' : 'file' });
    }
    return json([...out.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }
  if (path === '/api/upload' && method === 'POST') {
    const { path: p, message } = body;
    if (typeof p !== 'string') return json({ error: 'path required' }, 400);
    assets.add(p);
    const commit = record(String(message || `studio: upload ${p}`), new Map([[p, '<binary>']]));
    return json({ ok: true, path: p, commit });
  }
  if (path === '/api/commit' && method === 'POST') {
    const writes = Array.isArray(body.files) ? body.files : [];
    const deletes = Array.isArray(body.deletes) ? body.deletes : [];
    if (!writes.length && !deletes.length) return json({ error: 'Nothing to commit' }, 400);
    const stale: string[] = [];
    for (const w of writes) { const cur = files.get(w.path); if (w.sha && (cur === undefined || hash(cur) !== w.sha)) stale.push(w.path); }
    if (stale.length) return json({ error: 'conflict', detail: `These files changed since you loaded them: ${stale.join(', ')}. Reload and re-apply your edits.`, paths: stale }, 409);
    const changes = new Map<string, string | null>();
    for (const w of writes) { if (w.encoding === 'base64') { assets.add(w.path); changes.set(w.path, '<binary>'); } else { files.set(w.path, w.content); changes.set(w.path, w.content); } }
    for (const d of deletes) { const p = typeof d === 'string' ? d : d.path; if (files.delete(p) || assets.delete(p)) changes.set(p, null); }
    const commit = record(String(body.message || 'studio: update'), changes);
    return json({ ok: true, commit, head: commit, files: writes.map((w: { path: string; content: string }) => ({ path: w.path, sha: hash(w.content) })), deleted: [...changes].filter(([, v]) => v === null).map(([k]) => k) });
  }
  if (path === '/api/history' && method === 'GET') {
    const p = url.searchParams.get('path');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
    const list = commits.filter((c) => !p || c.changes.has(p)).slice().reverse().slice(0, limit);
    return json(list.map((c) => ({ sha: c.sha, message: c.message, date: c.date, author: c.author, url: `https://github.com/engr-sharif/portfolio/commit/${c.sha}` })));
  }
  if (path === '/api/assist' && method === 'POST') {
    const fn = TASK_REPLY[body.task];
    if (!fn) return json({ error: 'Unknown task' }, 400);
    await sleep(600);
    return json({ result: fn(String(body.text || '')) });
  }
  return json({ error: 'Not found' }, 404);
}
