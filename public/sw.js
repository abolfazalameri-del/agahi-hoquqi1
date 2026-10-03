// Service worker: offline fallback + fast repeat visits.
// Safety rules: /api/*, admin, account pages and every non-GET request are NEVER cached,
// so private user data is never stored or shown from a stale cache.
const VERSION = 'v1';
const STATIC = 'static-' + VERSION;
const PAGES = 'pages-' + VERSION;
const PRECACHE = ['/offline.html', '/assets/style.css', '/assets/app.js', '/assets/theme-init.js', '/assets/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isPrivate = (url) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/account');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || isPrivate(url)) return; // network only

  if (req.mode === 'navigate') {
    // public pages: network first, fall back to the last copy, then to the offline page
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(PAGES).then((c) => c.put(req, copy)); }
        return res;
      }).catch(async () => (await caches.match(req)) || caches.match('/offline.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/config/') || url.pathname === '/manifest.webmanifest') {
    // static files: show the cached copy immediately, refresh it in the background
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        const refresh = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || refresh;
      })
    );
  }
});
