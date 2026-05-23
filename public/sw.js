const CACHE = 'coach-ia-v15';
const CORE = [
  '/styles.css',
  '/icon.svg',
  '/manifest.webmanifest',
  '/login.html',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/marked@13.0.0/marked.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-first for API calls — we always want fresh data when online
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'Hors ligne — connectez-vous pour utiliser le coach IA' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Network-first for HTML navigation so the auth redirect is honored
  if (e.request.mode === 'navigate' || (e.request.method === 'GET' && e.request.headers.get('accept')?.includes('text/html'))) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(e.request).then((c) => c || caches.match('/login.html')))
    );
    return;
  }

  // Network-first for our own JS so updates land immediately instead of
  // being shadowed by a stale cached version after a redeploy.
  const isOwnJS = url.origin === self.location.origin && url.pathname.endsWith('.js');
  if (isOwnJS) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (CSS, images, CDN libs)
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((resp) => {
        if (resp.ok && e.request.method === 'GET') {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached)
    )
  );
});
