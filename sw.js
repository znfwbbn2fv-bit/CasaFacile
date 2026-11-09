/* CasaFacile 1.4.0-beta: App Shell offline. Non conserva risposte API o dati personali. */
const CACHE = 'casafacile-static-1.4.0-beta';
const APP_FILES = [
  './',
  './index.html',
  './styles.css?v=1.4.0-beta',
  './app.js?v=1.4.0-beta',
  './cloud-config.js?v=1.4.0-beta',
  './cloud-client.js?v=1.4.0-beta',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('casafacile-static-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(resp => {
      if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(cache => cache.put('./index.html', copy)); }
      return resp;
    }).catch(async () => await (await caches.open(CACHE)).match('./index.html') || Response.error()));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(resp => {
    if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return resp;
  })));
});
