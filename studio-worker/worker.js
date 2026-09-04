/**
 * Studio API — Cloudflare Worker backing the custom /studio admin.
 *
 * Provides a small, secure server for an otherwise-static site:
 *   POST /api/login           { password } -> { token }      (signed JWT session)
 *   GET  /api/file?path=…      -> { content, sha }            (read a repo file)
 *   PUT  /api/file            { path, content, message, sha } (commit a file)
 *   POST /api/upload          { path, base64, message }       (commit binary/image)
 *   DELETE /api/file          { path, message, sha }          (delete a file)
 *   GET  /api/list?dir=…       -> [{ name, path, sha }]        (list a directory)
 *   GET  /api/status          -> { ok, repo, branch }         (auth check)
 *   GET  /api/deploy-status?since=<ms>                        (is the site live yet?)
 *   POST /api/assist          { task, text, system?, image? } (Workers AI)
 *
 * All routes except /login require: Authorization: Bearer <token>.
 *
 * SECRETS (set with `wrangler secret put …` or the Cloudflare dashboard, never in code):
 *   STUDIO_PASSWORD     the admin password you log in with
 *   STUDIO_JWT_SECRET   random string used to sign session tokens
 *   GITHUB_TOKEN        a fine-grained PAT with contents:read+write on the repo
 * VARS (wrangler.toml [vars] or dashboard):
 *   GITHUB_REPO         e.g. "engr-sharif/portfolio"
 *   GITHUB_BRANCH       e.g. "main"
 *   ALLOWED_ORIGIN      e.g. "https://engr-sharif.github.io" — REQUIRED. Comma-separate
 *                       several (e.g. add "http://localhost:4321" for local dev).
 *   AI_TEXT_MODEL / AI_VISION_MODEL   optional model overrides
 * BINDINGS:
 *   AI                  Workers AI binding (optional; /api/assist returns 501 without it)
 *
 * Security posture (this revision):
 *   - CORS fails CLOSED: no ALLOWED_ORIGIN → no cross-origin access at all.
 *   - JWT verification pins alg=HS256 and rejects anything else.
 *   - /api/login and /api/assist are rate-limited per client IP (in-memory,
 *     per-isolate — a speed bump, not a guarantee; pair with Cloudflare WAF
 *     rules for hard limits).
 *   - /api/assist only fetches images from this repo's raw.githubusercontent
 *     path (closes the SSRF hole of fetching arbitrary URLs).
 *   - Repo paths are validated: relative, no "..", no control characters.
 */

const GH = 'https://api.github.com';
const enc = new TextEncoder();

/* ------------------------------------------------------- AI writing guide */
// The "master guide" the model follows for voice, tone, and structure. Used as
// the default system prompt for every assist; the Studio can override it by
// saving a non-empty guide in src/content/settings/ai.json.
const DEFAULT_GUIDE = `You are the writing assistant for Mohammad Sharif — an Environmental
Engineer (EIT) at Jacobs in Sacramento, California. His work is field-based site
characterization, remediation, and construction quality assurance: groundwater
and soil sampling, landfill-gas and compliance monitoring, XRF scanning, PFAS and
mercury sites, Title 27 work — and he builds Python field tools on the side.

You help him write and edit content for his portfolio. Match HIS voice. Write as
a working engineer, not a marketer.

VOICE & TONE
- First person, grounded, and precise. Plainspoken and direct.
- Quiet confidence. Let the work speak; never oversell.
- Technical but accessible — explain methods without jargon soup.
- Concrete and specific over vague. Prefer "collected 40 groundwater samples
  across 12 wells" to "performed extensive sampling."
- Active voice. Short, clear sentences. Vary length for rhythm.

HARD RULES
- Never invent facts, numbers, dates, clients, or outcomes. If a detail isn't in
  the input, leave it out — do not fill gaps with plausible-sounding specifics.
- Respect confidentiality: do not add client names or exact site locations that
  aren't already in the text.
- US spelling. Use real units (mg/kg, ft bgs, µg/L) when the input has them.
- No emoji in professional content. No hype.
- Avoid clichés and AI tells: "passionate," "cutting-edge," "leverage," "delve,"
  "tapestry," "in today's world," "seamless," "robust," "game-changer,"
  "testament to," "spearheaded," em-dash pile-ups, and empty intensifiers.
- Return ONLY the requested text — no preamble, no "Here is…," no explanation,
  no quotation marks around the whole thing.

CONTENT TYPES
- Project write-ups: what the site/problem was, your role, the methods and field
  work, and the outcome — factual and scoped.
- Field notes / blog: a bit more personal and observational; still grounded.
- Photo captions: one short factual sentence — what's happening, and where/what
  technique if it's evident. No hype.
- Alt text: one objective sentence describing what's visible, for screen readers.`;

// Per-task instruction appended to the guide.
const TASKS = {
  polish: 'TASK: Improve the clarity, flow, and concision of the text below. Preserve the meaning, every fact, and the author\'s voice. Fix awkward phrasing. Return only the improved text.',
  grammar: 'TASK: Correct grammar, spelling, and punctuation only. Do not change wording, style, or content beyond what correctness requires. Return only the corrected text.',
  summarize: 'TASK: Write a tight 1–2 sentence summary of the text below, leading with the key outcome or point. Return only the summary.',
  expand: 'TASK: The text below is rough notes or bullet points. Expand it into clear, well-structured prose that follows the guide. Do not add facts that are not present in the notes. Return only the prose.',
  alt: 'TASK: Look at the image and write one objective sentence describing what is visible, suitable as alt text for a screen reader. Be factual and specific. Return only the sentence.',
  caption: 'TASK: Look at the image and write one short, factual caption — what is happening, and the setting or technique if evident. No hype. Return only the caption.',
};

const MAX_ASSIST_CHARS = 20_000;     // ~5k tokens of input is plenty for a write-up
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_B64 = 70 * 1024 * 1024; // ~50 MB binary (GitHub Contents API ceiling is 100 MB)

/* ----------------------------------------------------------------- helpers */
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlFromStr = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
// standard base64 (GitHub wants standard, not url-safe) from a url-safe string
const b64urlToStd = (s) => s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signJWT(payload, secret, ttlSeconds = 60 * 60 * 8) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${b64urlFromStr(JSON.stringify(header))}.${b64urlFromStr(JSON.stringify(body))}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJWT(token, secret) {
  try {
    if (!secret) return null;
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    // Pin the algorithm: a token claiming anything but HS256 is rejected before
    // any crypto runs (defends against alg-confusion / "none" tricks).
    const header = JSON.parse(fromB64url(h));
    if (!header || header.alg !== 'HS256' || (header.typ && header.typ !== 'JWT')) return null;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      enc.encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(fromB64url(p));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    if (payload.iat && payload.iat > now + 60) return null; // issued in the future → forged clock
    if (payload.sub !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

// Constant-time-ish password compare.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/* --------------------------------------------------------------------- CORS */
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}
/** Fail closed: only echo an Origin that is explicitly allow-listed. With no
 * allow-list configured, no CORS headers are sent at all (browsers refuse). */
function cors(env, request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = allowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};
const json = (obj, env, request, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...cors(env, request) },
  });

/* ------------------------------------------------------------- rate limiting */
// Sliding window per client IP, held in isolate memory. Cloudflare may run many
// isolates, so treat this as friction against naive brute force rather than a
// hard ceiling. Buckets self-expire so memory stays bounded.
const buckets = new Map();
function rateLimited(request, key, limit, windowMs) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const id = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(id) || [];
  const recent = b.filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(id, recent);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return recent.length > limit;
}

/* ------------------------------------------------------------- path safety */
/** Repo-relative, no traversal, no control chars, no leading slash, ≤ 400 chars. */
function safeRepoPath(p) {
  if (typeof p !== 'string' || !p || p.length > 400) return null;
  if (/[ -]/.test(p)) return null;
  const parts = p.replace(/^\/+/, '').split('/');
  if (parts.some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  return parts.join('/');
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function gh(env, path, init = {}) {
  return fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'studio-worker',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
}
// Path segments must be encoded individually — encodeURIComponent on the whole
// path turns "/" into %2F, which the Contents API rejects for nested paths.
const ghPath = (p) => p.split('/').map(encodeURIComponent).join('/');

/* -------------------------------------------------------------------- main */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors(env, request) } });
    }

    // Refuse cross-origin browser requests from anywhere not allow-listed
    // (defence in depth on top of the browser's own CORS enforcement).
    const origin = request.headers.get('Origin');
    if (origin && !allowedOrigins(env).includes(origin.replace(/\/$/, ''))) {
      return json({ error: 'Origin not allowed' }, env, request, 403);
    }

    // --- login: password -> session token ---
    if (pathname === '/api/login' && request.method === 'POST') {
      if (rateLimited(request, 'login', 8, 10 * 60 * 1000)) {
        return json({ error: 'Too many sign-in attempts. Wait 10 minutes and try again.' }, env, request, 429);
      }
      const body = (await readJson(request)) || {};
      const password = typeof body.password === 'string' ? body.password : '';
      if (!env.STUDIO_PASSWORD || !env.STUDIO_JWT_SECRET || !safeEqual(password, env.STUDIO_PASSWORD)) {
        return json({ error: 'Invalid password' }, env, request, 401);
      }
      const token = await signJWT({ sub: 'admin' }, env.STUDIO_JWT_SECRET);
      return json({ token, expiresIn: 60 * 60 * 8 }, env, request);
    }

    // --- everything else requires a valid session ---
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const session = await verifyJWT(token, env.STUDIO_JWT_SECRET);
    if (!session) return json({ error: 'Unauthorized' }, env, request, 401);

    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    if (!repo || !env.GITHUB_TOKEN) {
      return json({ error: 'Worker is missing GITHUB_REPO / GITHUB_TOKEN configuration.' }, env, request, 500);
    }

    if (pathname === '/api/status') {
      return json({ ok: true, repo, branch, exp: session.exp }, env, request);
    }

    // --- deploy status: has a Pages deployment finished since `since` (ms)? ---
    // Lets the Studio say "Live" only when the site actually rebuilt, and
    // "failed" when the build broke — instead of guessing after a timer.
    if (pathname === '/api/deploy-status' && request.method === 'GET') {
      const since = Number(url.searchParams.get('since') || 0);
      const runsPath = `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&event=push&per_page=5`;
      let runs = await gh(env, runsPath);
      // A contents-only fine-grained PAT can't read Actions; the repo is public,
      // so fall back to an unauthenticated read (60 req/h is plenty here).
      if (!runs.ok) runs = await fetch(`${GH}${runsPath}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'studio-worker' } });
      if (!runs.ok) return json({ state: 'unknown' }, env, request);
      const d = await runs.json();
      const list = Array.isArray(d.workflow_runs) ? d.workflow_runs : [];
      const after = list.filter((r) => new Date(r.created_at).getTime() >= since - 15_000);
      if (after.length === 0) return json({ state: 'pending' }, env, request);
      const latest = after[0];
      if (latest.status !== 'completed') return json({ state: 'building', url: latest.html_url }, env, request);
      if (latest.conclusion === 'success') return json({ state: 'live', url: latest.html_url, at: latest.updated_at }, env, request);
      return json({ state: 'failed', url: latest.html_url, conclusion: latest.conclusion }, env, request);
    }

    // --- read a file ---
    if (pathname === '/api/file' && request.method === 'GET') {
      const path = safeRepoPath(url.searchParams.get('path'));
      if (!path) return json({ error: 'A valid repo path is required' }, env, request, 400);
      const res = await gh(env, `/repos/${repo}/contents/${ghPath(path)}?ref=${encodeURIComponent(branch)}`);
      if (res.status === 404) return json({ content: null, sha: null }, env, request);
      if (!res.ok) return json({ error: `GitHub ${res.status}` }, env, request, 502);
      const d = await res.json();
      return json({ content: d.content ? fromB64url(d.content.replace(/\n/g, '')) : '', sha: d.sha }, env, request);
    }

    // --- list a directory ---
    if (pathname === '/api/list' && request.method === 'GET') {
      const dir = safeRepoPath(url.searchParams.get('dir') || '') ?? '';
      const res = await gh(env, `/repos/${repo}/contents/${ghPath(dir)}?ref=${encodeURIComponent(branch)}`);
      if (res.status === 404) return json([], env, request);
      if (!res.ok) return json({ error: `GitHub ${res.status}` }, env, request, 502);
      const d = await res.json();
      return json(
        (Array.isArray(d) ? d : []).map((f) => ({ name: f.name, path: f.path, sha: f.sha, type: f.type })),
        env, request,
      );
    }

    // --- write a text file ---
    if (pathname === '/api/file' && request.method === 'PUT') {
      const body = await readJson(request);
      const path = safeRepoPath(body?.path);
      if (!path || typeof body.content !== 'string') return json({ error: 'path and content are required' }, env, request, 400);
      const res = await gh(env, `/repos/${repo}/contents/${ghPath(path)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: String(body.message || `studio: update ${path}`).slice(0, 200),
          content: b64urlToStd(b64urlFromStr(body.content)),
          branch,
          ...(body.sha ? { sha: String(body.sha) } : {}),
        }),
      });
      if (res.status === 409 || res.status === 422) {
        return json({ error: 'conflict', detail: 'This file changed since you opened it. Reload the entry and re-apply your edits.' }, env, request, 409);
      }
      if (!res.ok) return json({ error: `GitHub ${res.status}`, detail: (await res.text()).slice(0, 500) }, env, request, 502);
      const d = await res.json();
      return json({ ok: true, sha: d.content?.sha, commit: d.commit?.sha }, env, request);
    }

    // --- upload binary (image / pdf / video) ---
    if (pathname === '/api/upload' && request.method === 'POST') {
      const body = await readJson(request);
      const path = safeRepoPath(body?.path);
      if (!path || typeof body.base64 !== 'string') return json({ error: 'path and base64 are required' }, env, request, 400);
      const b64 = body.base64.includes(',') ? body.base64.split(',')[1] : body.base64; // strip data: prefix
      if (b64.length > MAX_UPLOAD_B64) return json({ error: 'File too large (max ~50 MB).' }, env, request, 413);
      // Replacing an existing file requires its sha — look it up so re-uploads
      // don't fail with a 422 from GitHub.
      let sha;
      const existing = await gh(env, `/repos/${repo}/contents/${ghPath(path)}?ref=${encodeURIComponent(branch)}`);
      if (existing.ok) sha = (await existing.json()).sha;
      const res = await gh(env, `/repos/${repo}/contents/${ghPath(path)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: String(body.message || `studio: upload ${path}`).slice(0, 200),
          content: b64,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!res.ok) return json({ error: `GitHub ${res.status}`, detail: (await res.text()).slice(0, 500) }, env, request, 502);
      return json({ ok: true, replaced: !!sha }, env, request);
    }

    // --- delete a file ---
    if (pathname === '/api/file' && request.method === 'DELETE') {
      const body = await readJson(request);
      const path = safeRepoPath(body?.path);
      if (!path || !body.sha) return json({ error: 'path and sha are required' }, env, request, 400);
      const res = await gh(env, `/repos/${repo}/contents/${ghPath(path)}`, {
        method: 'DELETE',
        body: JSON.stringify({ message: String(body.message || `studio: delete ${path}`).slice(0, 200), branch, sha: String(body.sha) }),
      });
      if (!res.ok) return json({ error: `GitHub ${res.status}` }, env, request, 502);
      return json({ ok: true }, env, request);
    }

    // --- AI assist (Cloudflare Workers AI): polish / summarize / caption … ---
    if (pathname === '/api/assist' && request.method === 'POST') {
      if (!env.AI) {
        return json({ error: 'AI is not enabled yet. Add a Workers AI binding named "AI" to this Worker.' }, env, request, 501);
      }
      if (rateLimited(request, 'assist', 40, 10 * 60 * 1000)) {
        return json({ error: 'Slow down — the assistant is limited to 40 requests every 10 minutes.' }, env, request, 429);
      }
      const body = (await readJson(request)) || {};
      const { task = 'polish', text = '', system, image } = body;
      if (!Object.prototype.hasOwnProperty.call(TASKS, task)) return json({ error: 'Unknown task' }, env, request, 400);
      if (typeof text === 'string' && text.length > MAX_ASSIST_CHARS) {
        return json({ error: `That's a lot of text — select a section under ${MAX_ASSIST_CHARS.toLocaleString()} characters.` }, env, request, 413);
      }
      const guide = (typeof system === 'string' && system.trim()) || DEFAULT_GUIDE;
      const instruction = TASKS[task];
      const isVision = task === 'alt' || task === 'caption';
      try {
        let out = '';
        if (isVision) {
          // SSRF guard: the only images we will ever fetch live in THIS repo.
          const allowedPrefix = `https://raw.githubusercontent.com/${repo}/`;
          if (typeof image !== 'string' || !image.startsWith(allowedPrefix)) {
            return json({ error: 'Only images stored in this site\'s repository can be described.' }, env, request, 400);
          }
          const imgRes = await fetch(image, { headers: { 'User-Agent': 'studio-worker' } });
          if (!imgRes.ok) return json({ error: 'Could not fetch the image (has it finished publishing?).' }, env, request, 502);
          const buf = await imgRes.arrayBuffer();
          if (buf.byteLength > MAX_IMAGE_BYTES) return json({ error: 'Image too large to describe (max 8 MB).' }, env, request, 413);
          const bytes = [...new Uint8Array(buf)];
          const model = env.AI_VISION_MODEL || '@cf/llava-hf/llava-1.5-7b-hf';
          const r = await env.AI.run(model, { image: bytes, prompt: `${guide}\n\n${instruction}`, max_tokens: 256 });
          out = r.description ?? r.response ?? '';
        } else {
          const model = env.AI_TEXT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
          const r = await env.AI.run(model, {
            max_tokens: 1024,
            messages: [
              { role: 'system', content: `${guide}\n\n${instruction}` },
              { role: 'user', content: String(text || '') },
            ],
          });
          out = r.response ?? '';
        }
        return json({ result: String(out || '').trim() }, env, request);
      } catch (e) {
        return json({ error: 'AI request failed', detail: String((e && e.message) || e).slice(0, 300) }, env, request, 502);
      }
    }

    return json({ error: 'Not found' }, env, request, 404);
  },
};
