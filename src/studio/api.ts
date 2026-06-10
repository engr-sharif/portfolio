/**
 * Studio API client — talks to the Cloudflare Worker (studio-worker).
 * Holds the session token in memory + localStorage; every call is authed.
 */
const STORE_KEY = 'studio.token';
const ENDPOINT_KEY = 'studio.endpoint';

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

async function call(path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${getEndpoint()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(20000),
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
    throw new Error(
      `Connection failed — ${reason}. This is usually a network firewall, VPN, ` +
      `or a privacy/ad-block extension blocking the studio server (workers.dev). ` +
      `Try another network, a different browser, or disabling extensions.`,
    );
  }
  if (res.status === 401) { clearToken(); throw new Error('Session expired — please log in again.'); }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}). ${t}`);
  }
  return res.json();
}

export async function login(password: string): Promise<void> {
  const { token } = await call('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
  setToken(token);
}

export const status = () => call('/api/status');

/** Latest GitHub Pages deployment time (public API, no auth) — for the
 * "Building… → Live" indicator. Returns ms epoch or null. */
export async function lastDeployTime(): Promise<number | null> {
  try {
    const r = await fetch('https://api.github.com/repos/engr-sharif/portfolio/deployments?per_page=1', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.[0]?.updated_at ? new Date(d[0].updated_at).getTime() : null;
  } catch {
    return null;
  }
}

export interface FileResult { content: string | null; sha: string | null }
export const readFile = (path: string): Promise<FileResult> =>
  call(`/api/file?path=${encodeURIComponent(path)}`);

export const writeFile = (path: string, content: string, message: string, sha?: string | null) =>
  call('/api/file', { method: 'PUT', body: JSON.stringify({ path, content, message, sha: sha || undefined }) });

export const deleteFile = (path: string, message: string, sha: string) =>
  call('/api/file', { method: 'DELETE', body: JSON.stringify({ path, message, sha }) });

export interface ListEntry { name: string; path: string; sha: string; type: string }
export const listDir = (dir: string): Promise<ListEntry[]> =>
  call(`/api/list?dir=${encodeURIComponent(dir)}`);

export const uploadImage = (path: string, base64: string, message: string) =>
  call('/api/upload', { method: 'POST', body: JSON.stringify({ path, base64, message }) });
