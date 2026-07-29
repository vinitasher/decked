/* Service worker — offline cache for PWA */
const CACHE = 'sdf-v1';
const STATIC = ['/', '/index.html', '/css/style.css', '/js/app.js', '/js/srs.js', '/js/render.js', '/js/cards.js', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => new Response('Offline', { status: 503 })))
  );
});
