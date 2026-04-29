// ── NLP Spatial Repo — Service Worker ──
const CACHE_NAME = 'nlp-spatial-repo-v1';

// App shell resources to pre-cache
const APP_SHELL = [
  './nlp-spatial-repo.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// CDN resources to cache on first use
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'esm.sh',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Some app shell resources failed to cache:', err);
      });
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Helper: check if a URL is from a CDN host
function isCDN(url) {
  return CDN_HOSTS.some((host) => url.includes(host));
}

// Fetch strategy:
// - App shell files: Cache-first, fall back to network
// - CDN resources: Stale-while-revalidate (show cache, update in background)
// - Everything else: Network-first, fall back to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.startsWith('http')) return;

  // App shell: cache-first
  if (APP_SHELL.some((shell) => url.endsWith(shell.replace('./', '/')))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // CDN resources: stale-while-revalidate
  if (isCDN(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
