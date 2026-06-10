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
  const res = await fetch(`${getEndpoint()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(init.headers || {}),
    },
  });
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
