/**
 * Studio API client — talks to the Cloudflare Worker (studio-worker).
 * Holds the session token in localStorage; every call is authed.
 *
 * Errors are normalised into human sentences (the UI shows `err.message`
 * verbatim). A 401 clears the token and broadcasts `studio:unauthorized` so
 * the shell can show a re-login overlay WITHOUT unmounting the editor — the
 * author's unsaved work stays on screen.
 */
const STORE_KEY = 'studio.token';
const ENDPOINT_KEY = 'studio.endpoint';

export const REPO = 'engr-sharif/portfolio';
export const BRANCH = 'main';

// The Worker URL is configured once (defaults baked in; overridable for testing).
export function getEndpoint(): string {
  return (
    localStorage.getItem(ENDPOINT_KEY) ||
    'https://engr-sharif-studio.engr-sharif209.workers.dev'
  );
}
export const setEndpoint = (url: string) => localStorage.setItem(ENDPOINT_KEY, url.replace(/\/$/, ''));

export const getToken = () => localStorage.getItem(STORE_KEY) || '';
export const setToken = (t: string) => localStorage.setItem(STORE_KEY, t);
export const clearToken = () => localStorage.removeItem(STORE_KEY);
export const isLoggedIn = () => !!getToken();

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Extra structured fields from the server (e.g. `paths` on a 409). */
  data?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}
export const isSessionExpired = (e: unknown) => e instanceof ApiError && e.status === 401;
export const isConflict = (e: unknown) => e instanceof ApiError && e.status === 409;
/** The deployed Worker predates this route (the Studio then falls back to the
 * older, per-file behaviour so an out-of-date Worker never blocks editing). */
export const isMissingRoute = (e: unknown) => e instanceof ApiError && e.status === 404 && e.code === 'Not found';

const FRIENDLY: Record<number, string> = {
  400: 'The server rejected that request as invalid.',
  403: 'The server refused that request (origin not allowed).',
  404: 'Not found.',
  409: 'This entry changed since you opened it. Reload it and re-apply your edits.',
  413: 'That file is too large.',
  429: 'Too many requests — give it a moment and try again.',
  500: 'The Studio server hit an internal error.',
  501: 'That feature isn’t enabled on the server yet.',
  502: 'GitHub didn’t accept the request. Try again in a moment.',
};

async function call(path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${getEndpoint()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (e: any) {
    // Network-level failure (couldn't reach the Worker at all) — usually a
    // corporate firewall/proxy or a privacy extension blocking *.workers.dev.
    const reason = e?.name === 'TimeoutError' ? 'timed out' : 'could not reach the server';
    throw new ApiError(
      `Connection failed — ${reason}. This is usually a network firewall, VPN, ` +
      `or a privacy/ad-block extension blocking the studio server (workers.dev). ` +
      `Try another network, a different browser, or disabling extensions.`,
      0,
    );
  }
  if (res.status === 401) {
    if (path !== '/api/login') {
      clearToken();
      window.dispatchEvent(new CustomEvent('studio:unauthorized'));
      throw new ApiError('Your session expired. Sign in again — your unsaved work is still here.', 401);
    }
    throw new ApiError('Wrong password.', 401);
  }
  if (!res.ok) {
    let msg = FRIENDLY[res.status] || `Request failed (${res.status}).`;
    let code: string | undefined;
    let data: Record<string, unknown> | undefined;
    try {
      const body = await res.json();
      // Server-provided messages are already written for humans.
      if (body?.error && body.error !== 'conflict') msg = String(body.error);
      if (body?.detail && res.status !== 502) msg += ` ${String(body.detail)}`;
      code = body?.error;
      if (body && typeof body === 'object') data = body;
    } catch { /* non-JSON body */ }
    throw new ApiError(msg, res.status, code, data);
  }
  return res.json();
}

export async function login(password: string): Promise<void> {
  const { token } = await call('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
  setToken(token);
}

export const status = () => call('/api/status');

export type DeployState = 'pending' | 'building' | 'live' | 'failed' | 'unknown';
export interface DeployStatus { state: DeployState; url?: string; at?: string }

/** Has the site rebuilt since `since` (ms epoch)? Asks the Worker (which reads
 * the Actions run for the deploy branch); on any failure falls back to
 * GitHub's public deployments list so the indicator still has a signal. */
export async function deployStatus(since: number): Promise<DeployStatus> {
  try {
    const d = (await call(`/api/deploy-status?since=${since}`)) as DeployStatus;
    if (d?.state && d.state !== 'unknown') return d;
  } catch { /* fall through to the public API */ }
  const t = await lastDeployTime();
  if (t && t > since) return { state: 'live' };
  return { state: 'unknown' };
}

/** Latest GitHub Pages deployment time (public API, no auth). Returns ms epoch or null. */
export async function lastDeployTime(): Promise<number | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/deployments?per_page=1`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.[0]?.updated_at ? new Date(d[0].updated_at).getTime() : null;
  } catch {
    return null;
  }
}

export interface FileResult { content: string | null; sha: string | null; ref?: string }
export const readFile = (path: string): Promise<FileResult> =>
  call(`/api/file?path=${encodeURIComponent(path)}`);

/** The file as it was at a past commit (sha from `history()`). The returned
 * `sha` is that version's blob — never use it to save over the live file. */
export const readFileAt = (path: string, ref: string): Promise<FileResult> =>
  call(`/api/file?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`);

export interface CommitFile { path: string; content: string; sha?: string | null; encoding?: 'utf-8' | 'base64' }
export interface CommitDelete { path: string; sha?: string | null }
export interface CommitResult { ok: true; commit: string; head: string; noop?: boolean; files: { path: string; sha: string }[]; deleted?: string[] }

/** Write and/or delete several files as ONE commit. Either everything lands or
 * nothing does. Pass each file's loaded `sha` for per-file conflict detection
 * (a 409 lists the stale paths in `err.data.paths`). */
export const commitFiles = (message: string, files: CommitFile[], deletes: CommitDelete[] = []): Promise<CommitResult> =>
  call('/api/commit', { method: 'POST', body: JSON.stringify({ message, files, deletes }) });

export interface HistoryEntry { sha: string; message: string; date: string | null; author: string; url?: string }
/** Commits that touched `path` (newest first) — or the whole site when omitted. */
export const history = (path?: string, limit = 20): Promise<HistoryEntry[]> =>
  call(`/api/history?${path ? `path=${encodeURIComponent(path)}&` : ''}limit=${limit}`);

export const writeFile = (path: string, content: string, message: string, sha?: string | null): Promise<{ ok: true; sha?: string }> =>
  call('/api/file', { method: 'PUT', body: JSON.stringify({ path, content, message, sha: sha || undefined }) });

export const deleteFile = (path: string, message: string, sha: string) =>
  call('/api/file', { method: 'DELETE', body: JSON.stringify({ path, message, sha }) });

export interface ListEntry { name: string; path: string; sha: string; type: string }
export const listDir = (dir: string): Promise<ListEntry[]> =>
  call(`/api/list?dir=${encodeURIComponent(dir)}`);

export const uploadImage = (path: string, base64: string, message: string) =>
  call('/api/upload', { method: 'POST', body: JSON.stringify({ path, base64, message }) });

/** AI assist via the Worker's Cloudflare Workers AI binding. `task` is one of
 * polish|grammar|summarize|expand (text) or alt|caption (vision, needs image
 * URL). Returns { result }. */
export const aiAssist = (
  task: string,
  text: string,
  opts: { system?: string; image?: string } = {},
): Promise<{ result: string }> =>
  call('/api/assist', { method: 'POST', body: JSON.stringify({ task, text, ...opts }) });

/** Public raw-content URL for a repo image (the repo is public, so no auth).
 * Accepts stored values like "/src/assets/covers/x.jpg" or "x.jpg". */
export function rawImageUrl(stored: string, fallbackDir = 'src/assets'): string {
  if (!stored) return '';
  if (/^https?:\/\//.test(stored)) return stored;
  let path = stored.replace(/^\//, '');
  if (!path.startsWith('src/')) path = `${fallbackDir}/${path.split('/').pop()}`;
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`;
}

/** Raw URL for a file at an exact repo path (no folder remapping) — used to
 * preview public assets like /og/share.png (stored at public/og/share.png). */
export function rawRepoUrl(repoPath: string): string {
  const p = repoPath.replace(/^\//, '');
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${p}`;
}
