import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// @ts-ignore — the Worker is plain JS with no type declarations.
import worker from '../studio-worker/worker.js';

/**
 * Exercises the Worker's atomic commit + history routes against an in-memory
 * stand-in for GitHub's Git Data API. What matters: one commit for N files,
 * conflicts refused with NOTHING written, deletes of missing paths tolerated,
 * and history/ref reads mapped to the Studio's shapes.
 */
const env = {
  STUDIO_PASSWORD: 'pw', STUDIO_JWT_SECRET: 'unit-test-secret', GITHUB_TOKEN: 'ghp_test',
  GITHUB_REPO: 'o/r', GITHUB_BRANCH: 'main', ALLOWED_ORIGIN: 'http://studio.test',
};
const REPO = '/repos/o/r';

type Blob = { path: string; sha: string };
let git: { head: string; commits: Record<string, { tree: string; message: string; parents: string[] }>; trees: Record<string, Blob[]>; blobs: Record<string, string>; blobCalls: number; n: number };

function resetGit() {
  git = {
    head: 'c000000',
    commits: { c000000: { tree: 't0', message: 'init', parents: [] } },
    trees: { t0: [{ path: 'src/content/projects/a.md', sha: 'aaaaaaa' }, { path: 'src/content/projects/b.md', sha: 'bbbbbbb' }, { path: 'src/content/projects/c.md', sha: 'ccccccc' }] },
    blobs: {}, blobCalls: 0, n: 1,
  };
}
const id = (p: string) => `${p}${String(git.n++).padStart(6, '0')}`;
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function fakeGitHub(input: string, init: RequestInit = {}) {
  const url = new URL(input);
  const p = url.pathname;
  const m = (init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : {};
  if (p === `${REPO}/git/ref/heads/main`) return res({ object: { sha: git.head } });
  let mt = p.match(new RegExp(`^${REPO}/git/commits/(\\w+)$`));
  if (mt && m === 'GET') return git.commits[mt[1]] ? res({ tree: { sha: git.commits[mt[1]].tree } }) : res({}, 404);
  mt = p.match(new RegExp(`^${REPO}/git/trees/(\\w+)$`));
  if (mt && m === 'GET') return res({ tree: git.trees[mt[1]].map((b) => ({ ...b, type: 'blob' })), truncated: false });
  if (p === `${REPO}/git/blobs` && m === 'POST') { git.blobCalls++; const sha = id('b'); git.blobs[sha] = body.content; return res({ sha }, 201); }
  if (p === `${REPO}/git/trees` && m === 'POST') {
    const base = [...git.trees[body.base_tree]];
    for (const e of body.tree) {
      const i = base.findIndex((b) => b.path === e.path);
      if (e.sha === null) { if (i < 0) return res({ message: 'path not found' }, 422); base.splice(i, 1); }
      else if (i >= 0) base[i] = { path: e.path, sha: e.sha };
      else base.push({ path: e.path, sha: e.sha });
    }
    const sha = id('t'); git.trees[sha] = base; return res({ sha }, 201);
  }
  if (p === `${REPO}/git/commits` && m === 'POST') { const sha = id('c'); git.commits[sha] = { tree: body.tree, message: body.message, parents: body.parents }; return res({ sha }, 201); }
  if (p === `${REPO}/git/refs/heads/main` && m === 'PATCH') {
    if (!git.commits[body.sha].parents.includes(git.head)) return res({ message: 'Update is not a fast forward' }, 422);
    git.head = body.sha; return res({ object: { sha: body.sha } });
  }
  if (p === `${REPO}/commits` && m === 'GET') {
    expect(url.searchParams.get('sha')).toBe('main');
    return res([{ sha: 'c000000', html_url: 'https://github.com/o/r/commit/c000000', commit: { message: 'studio: update a\n\nlong body', author: { name: 'Nawaz', date: '2026-09-01T10:00:00Z' } }, author: { login: 'engr-sharif' } }]);
  }
  mt = p.match(new RegExp(`^${REPO}/contents/(.+)$`));
  if (mt && m === 'GET') {
    const ref = url.searchParams.get('ref');
    return res({ sha: `blob-at-${ref}`, content: btoa(`content@${ref}`) });
  }
  return res({ message: `unhandled ${m} ${p}` }, 500);
}

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) };
  const r = await worker.fetch(new Request(`https://w.test${path}`, { ...init, headers }), env);
  return { status: r.status, body: await r.json() };
}

let token = '';
beforeEach(async () => {
  resetGit();
  vi.stubGlobal('fetch', vi.fn(fakeGitHub));
  if (!token) token = (await api('/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw' }) })).body.token;
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/commit', () => {
  it('lands several writes and a delete as ONE fast-forward commit', async () => {
    const r = await api('/api/commit', {
      method: 'POST', token,
      body: JSON.stringify({
        message: 'studio: reorder 2 entries',
        files: [
          { path: 'src/content/projects/a.md', content: 'A2', sha: 'aaaaaaa' },
          { path: 'src/content/projects/b.md', content: 'B2', sha: 'bbbbbbb' },
        ],
        deletes: [{ path: 'src/content/projects/c.md' }, { path: 'src/content/projects/gone.md' }],
      }),
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(git.head).toBe(r.body.commit);
    const c = git.commits[git.head];
    expect(c.message).toBe('studio: reorder 2 entries');
    expect(c.parents).toEqual(['c000000']);
    const tree = git.trees[c.tree];
    expect(tree.map((b) => b.path).sort()).toEqual(['src/content/projects/a.md', 'src/content/projects/b.md']);
    expect(git.blobs[tree.find((b) => b.path === 'src/content/projects/a.md')!.sha]).toBe('A2');
    expect(r.body.files).toHaveLength(2);
    expect(r.body.deleted).toEqual(['src/content/projects/c.md']); // the missing path was dropped, not fatal
  });

  it('refuses a stale sha with 409 and writes nothing', async () => {
    const r = await api('/api/commit', {
      method: 'POST', token,
      body: JSON.stringify({ files: [{ path: 'src/content/projects/a.md', content: 'A2', sha: 'aaaaaaa' }, { path: 'src/content/projects/b.md', content: 'B2', sha: '1234567' }] }),
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflict');
    expect(r.body.paths).toEqual(['src/content/projects/b.md']);
    expect(git.head).toBe('c000000');
    expect(git.blobCalls).toBe(0);
  });

  it('turns a racing push (non-fast-forward) into a 409', async () => {
    const orig = fakeGitHub;
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      // someone else moves the branch after we read it, before our ref update
      if (String(input).endsWith('/git/commits') && init?.method === 'POST') { git.commits.c999999 = { tree: 't0', message: 'other', parents: [git.head] }; git.head = 'c999999'; }
      return orig(String(input), init);
    }));
    const r = await api('/api/commit', { method: 'POST', token, body: JSON.stringify({ files: [{ path: 'x.md', content: 'X' }] }) });
    expect(r.status).toBe(409);
    expect(git.head).toBe('c999999');
  });

  it('validates input', async () => {
    expect((await api('/api/commit', { method: 'POST', token, body: JSON.stringify({ files: [] }) })).status).toBe(400);
    expect((await api('/api/commit', { method: 'POST', token, body: JSON.stringify({ files: [{ path: '../etc/passwd', content: '' }] }) })).status).toBe(400);
    expect((await api('/api/commit', { method: 'POST', token, body: JSON.stringify({ files: [{ path: 'a.md', content: '1' }, { path: 'a.md', content: '2' }] }) })).status).toBe(400);
    expect((await api('/api/commit', { method: 'POST', body: JSON.stringify({ files: [{ path: 'a.md', content: '1' }] }) })).status).toBe(401);
  });
});

describe('history + versions', () => {
  it('GET /api/history maps commits to the Studio shape', async () => {
    const r = await api('/api/history?path=src/content/projects/a.md&limit=5', { token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ sha: 'c000000', message: 'studio: update a', date: '2026-09-01T10:00:00Z', author: 'Nawaz', url: 'https://github.com/o/r/commit/c000000' }]);
  });

  it('GET /api/file?ref= reads the file at that commit and echoes the ref', async () => {
    const r = await api('/api/file?path=src/content/projects/a.md&ref=c000000', { token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ content: 'content@c000000', sha: 'blob-at-c000000', ref: 'c000000' });
    expect((await api('/api/file?path=a.md&ref=main;rm', { token })).status).toBe(400);
  });
});

describe('GET /api/deploy-status', () => {
  /** Serve the two GitHub signals the route reads: check runs (what the
   * Cloudflare Pages app posts — verified live on PR #60) and commit statuses. */
  const withSignals = (checkRuns: unknown[], statuses: unknown[] = []) => {
    const orig = fakeGitHub;
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      const u = new URL(String(input));
      if (/\/commits\/[^/]+\/check-runs$/.test(u.pathname)) return res({ total_count: checkRuns.length, check_runs: checkRuns });
      if (/\/commits\/[^/]+\/status$/.test(u.pathname)) return res({ state: 'pending', sha: 'c000000', statuses });
      return orig(String(input), init);
    }));
  };
  const cf = (over: Record<string, unknown>) => ({ name: 'Cloudflare Pages', status: 'completed', conclusion: 'success', details_url: 'https://dash/deploy', started_at: '2026-09-05T02:44:40Z', completed_at: '2026-09-05T02:44:40Z', ...over });

  it('maps the Cloudflare Pages check run to live / building / failed', async () => {
    withSignals([cf({}), { name: 'check', status: 'completed', conclusion: 'failure' }]); // CI's own failure must not be mistaken for a deploy failure
    expect((await api('/api/deploy-status?commit=c000000', { token })).body).toMatchObject({ state: 'live', url: 'https://dash/deploy', at: '2026-09-05T02:44:40Z' });

    withSignals([cf({ status: 'in_progress', conclusion: null, completed_at: null })]);
    expect((await api('/api/deploy-status?commit=c000000', { token })).body).toMatchObject({ state: 'building' });

    withSignals([cf({ conclusion: 'failure', completed_at: '2026-09-05T03:00:00Z' }), cf({ completed_at: '2026-09-05T02:00:00Z' })]);
    expect((await api('/api/deploy-status?commit=c000000', { token })).body).toMatchObject({ state: 'failed', conclusion: 'failure' });
  });

  it('falls back to a hosting commit status, and says unknown rather than guessing', async () => {
    withSignals([], [{ context: 'Cloudflare Pages', state: 'failure', target_url: 'https://dash/fail', updated_at: '2026-09-05T02:00:00Z' }]);
    expect((await api('/api/deploy-status', { token })).body).toMatchObject({ state: 'failed', url: 'https://dash/fail' });

    withSignals([{ name: 'check', status: 'completed', conclusion: 'success' }], [{ context: 'check', state: 'success' }]);
    expect((await api('/api/deploy-status', { token })).body).toEqual({ state: 'unknown' });
  });
});

describe('safeRepoPath (via GET /api/file)', () => {
  /** Regression: a stray control character in the validator's character class
   * made every path with a hyphen a 400 — i.e. nearly every content file. */
  it('accepts hyphenated, nested, dotted paths and rejects traversal / odd bytes', async () => {
    for (const p of ['src/content/projects/pge-bakersfield-mgp.md', 'src/assets/blog/2026-09-05-cell-4-liner-seams-north-slope-1.jpg', 'public/resume/Sharif_Resume.pdf']) {
      const r = await api(`/api/file?path=${encodeURIComponent(p)}`, { token });
      expect(r.status, p).toBe(200);
    }
    for (const p of ['../secrets', 'src//x.md', 'src/./x.md', 'a b.md', 'x;rm', 'src/content/..']) {
      const r = await api(`/api/file?path=${encodeURIComponent(p)}`, { token });
      expect(r.status, p).toBe(400);
    }
  });
});
