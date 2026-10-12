/* Service worker — offline cache for PWA */
const CACHE = 'sdf-v38';
const STATIC = ['/', '/index.html', '/css/style.css', '/js/app.js', '/js/srs.js', '/js/render.js', '/js/cards.js', '/js/wiki.js', '/js/concept-categories.js', '/js/design-decisions.js', '/js/sandbox.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.ico', 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET'
      || url.origin !== self.location.origin
      || (url.pathname.startsWith('/api/') && !['/api/generate', '/api/wiki', '/api/sandbox'].includes(url.pathname))) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const cachedResponse = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, cachedResponse));
        }
        return response;
      })
      .catch(() => caches.match(e.request)
        .then(response => response || new Response('Offline', { status: 503 })))
  );
});
