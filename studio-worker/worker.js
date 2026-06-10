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
 *   GET  /api/status          -> { user, repo, branch }       (auth check)
 *
 * All write/read routes (except /login) require: Authorization: Bearer <token>.
 *
 * SECRETS (set with `wrangler secret put …`, never in code):
 *   STUDIO_PASSWORD     the admin password you log in with
 *   STUDIO_JWT_SECRET   random string used to sign session tokens
 *   GITHUB_TOKEN        a fine-grained PAT with contents:read+write on the repo
 * VARS (wrangler.toml [vars]):
 *   GITHUB_REPO         e.g. "engr-sharif/portfolio"
 *   GITHUB_BRANCH       e.g. "main"
 *   ALLOWED_ORIGIN      e.g. "https://engr-sharif.github.io"
 */

const GH = 'https://api.github.com';
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------- AI writing guide */
// The "master guide" the local model follows for voice, tone, and structure.
// Used as the default system prompt for every assist; the Studio can override
// it by saving a non-empty guide in src/content/settings/ai.json.
const DEFAULT_GUIDE = `You are the writing assistant for Mohammad "Nawaz" Sharif — an Environmental
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

/* ----------------------------------------------------------------- helpers */
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlFromStr = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

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
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      enc.encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(fromB64url(p));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
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

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
const json = (obj, env, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

async function gh(env, path, init = {}) {
  const res = await fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'studio-worker',
      ...(init.headers || {}),
    },
  });
  return res;
}

/* -------------------------------------------------------------------- main */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    // --- login: password -> session token ---
    if (pathname === '/api/login' && request.method === 'POST') {
      const { password } = await request.json().catch(() => ({}));
      if (!env.STUDIO_PASSWORD || !safeEqual(password || '', env.STUDIO_PASSWORD)) {
        return json({ error: 'Invalid password' }, env, 401);
      }
      const token = await signJWT({ sub: 'admin' }, env.STUDIO_JWT_SECRET);
      return json({ token }, env);
    }

    // --- everything else requires a valid session ---
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const session = await verifyJWT(token, env.STUDIO_JWT_SECRET);
    if (!session) return json({ error: 'Unauthorized' }, env, 401);

    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';

    if (pathname === '/api/status') {
      return json({ ok: true, repo, branch }, env);
    }

    // --- read a file ---
    if (pathname === '/api/file' && request.method === 'GET') {
      const path = url.searchParams.get('path');
      if (!path) return json({ error: 'path required' }, env, 400);
      const res = await gh(env, `/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`);
      if (res.status === 404) return json({ content: null, sha: null }, env);
      if (!res.ok) return json({ error: `GitHub ${res.status}` }, env, 502);
      const d = await res.json();
      return json({ content: d.content ? fromB64url(d.content.replace(/\n/g, '')) : '', sha: d.sha }, env);
    }

    // --- list a directory ---
    if (pathname === '/api/list' && request.method === 'GET') {
      const dir = url.searchParams.get('dir') || '';
      const res = await gh(env, `/repos/${repo}/contents/${encodeURIComponent(dir)}?ref=${branch}`);
      if (!res.ok) return json({ error: `GitHub ${res.status}` }, env, 502);
      const d = await res.json();
      return json(
        (Array.isArray(d) ? d : []).map((f) => ({ name: f.name, path: f.path, sha: f.sha, type: f.type })),
        env,
      );
    }

    // --- write a text file ---
    if (pathname === '/api/file' && request.method === 'PUT') {
      const { path, content, message, sha } = await request.json();
      const res = await gh(env, `/repos/${repo}/contents/${encodeURIComponent(path)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: message || `studio: update ${path}`,
          content: b64urlToStd(b64urlFromStr(content)),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!res.ok) return json({ error: `GitHub ${res.status}`, detail: await res.text() }, env, 502);
      const d = await res.json();
      return json({ ok: true, sha: d.content?.sha }, env);
    }

    // --- upload binary (image) ---
    if (pathname === '/api/upload' && request.method === 'POST') {
      const { path, base64, message } = await request.json();
      const res = await gh(env, `/repos/${repo}/contents/${encodeURIComponent(path)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: message || `studio: upload ${path}`,
          content: base64.includes(',') ? base64.split(',')[1] : base64, // strip data: prefix
          branch,
        }),
      });
      if (!res.ok) return json({ error: `GitHub ${res.status}`, detail: await res.text() }, env, 502);
      return json({ ok: true }, env);
    }

    // --- delete a file ---
    if (pathname === '/api/file' && request.method === 'DELETE') {
      const { path, message, sha } = await request.json();
      const res = await gh(env, `/repos/${repo}/contents/${encodeURIComponent(path)}`, {
        method: 'DELETE',
        body: JSON.stringify({ message: message || `studio: delete ${path}`, branch, sha }),
      });
      if (!res.ok) return json({ error: `GitHub ${res.status}` }, env, 502);
      return json({ ok: true }, env);
    }

    // --- AI assist (Cloudflare Workers AI): polish / summarize / caption … ---
    if (pathname === '/api/assist' && request.method === 'POST') {
      if (!env.AI) {
        return json({ error: 'AI is not enabled yet. Add a Workers AI binding named "AI" to this Worker.' }, env, 501);
      }
      const { task = 'polish', text = '', system, image } = await request.json().catch(() => ({}));
      const guide = (system && system.trim()) || DEFAULT_GUIDE;
      const instruction = TASKS[task] || TASKS.polish;
      const isVision = task === 'alt' || task === 'caption';
      try {
        let out = '';
        if (isVision) {
          if (!image) return json({ error: 'image required' }, env, 400);
          const imgRes = await fetch(image);
          if (!imgRes.ok) return json({ error: 'could not fetch image' }, env, 502);
          const bytes = [...new Uint8Array(await imgRes.arrayBuffer())];
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
        return json({ result: String(out || '').trim() }, env);
      } catch (e) {
        return json({ error: 'AI request failed', detail: String((e && e.message) || e) }, env, 502);
      }
    }

    return json({ error: 'Not found' }, env, 404);
  },
};

// standard base64 (GitHub wants standard, not url-safe) from a url-safe string
function b64urlToStd(s) {
  return s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
}
