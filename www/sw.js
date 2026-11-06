// Offline support: always try the network first (so updates arrive), fall back to the last copy.
const C = 'typeg-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(u.pathname.endsWith('prices.enc') ? 'prices.enc' : e.request, copy)); }
    return r;
  }).catch(() => caches.match(u.pathname.endsWith('prices.enc') ? 'prices.enc' : e.request, { ignoreSearch: true })));
});
