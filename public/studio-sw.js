/* Studio service worker — makes /studio/ open with no signal so the field log
 * can capture on site. Scope is the Studio only (registered with scope
 * <base>studio/); the public site is untouched.
 *   navigations  → network first, cached copy when offline
 *   /_astro/*    → cache first (hashed, immutable build assets)
 * API calls go to another origin and never pass through here; build.json is
 * excluded so the Studio's Live indicator always sees the network. */
const CACHE = 'studio-shell-v1';
// Servers send `Vary: Origin` on module scripts and the browser's real request
// carries an Origin header our stored request never had — without this, every
// cached asset misses. Build assets are content-hashed, so Vary is irrelevant.
const MATCH = { ignoreVary: true };

// Precache the Studio page itself on install: the very first visit's
// navigation happened before this worker controlled anything.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try { const cache = await caches.open(CACHE); await cache.add(new Request(self.registration.scope, { cache: 'reload' })); } catch { /* offline install — fine */ }
    await self.skipWaiting();
  })());
});

// The page posts the asset URLs it already loaded (also fetched before we
// were in control); later requests are intercepted normally.
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'precache' || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(d.urls.map(async (u) => { try { if (!(await cache.match(u))) await cache.add(u); } catch { /* skip */ } }));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isAsset = (url) => url.pathname.includes('/_astro/') || /\.(woff2?|svg|webmanifest)$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/build.json')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(req, MATCH)) || (await cache.match(self.registration.scope, MATCH)) || new Response('<!doctype html><title>Offline</title><p style="font:16px system-ui;padding:2rem">The Studio has not been opened on this device while online yet, so it is not available offline.</p>', { status: 503, headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  if (isAsset(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, MATCH);
      if (hit) return hit;
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })());
  }
});
