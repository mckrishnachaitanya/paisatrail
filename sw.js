// PaisaTrail service worker — caches the app shell so it works offline
// and loads instantly. index.html uses stale-while-revalidate: the cached
// copy is always served immediately (same instant load as before), and a
// background fetch quietly refreshes the cache for the next launch — so a
// new deploy is picked up automatically, no manual cache-busting needed.
// Everything else (manifest.json, icons) stays cache-first — bump
// CACHE_NAME if either of those ever needs to change.

const CACHE_NAME = 'paisatrail-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache:'no-store' on each precache request — without it, the
      // browser's own HTTP cache (a layer below CacheStorage) can hand
      // back a stale response here, which would defeat the whole point of
      // bumping CACHE_NAME to force a clean re-fetch.
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'no-store' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppShell = event.request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/');

  if (isAppShell) {
    // Stale-while-revalidate: the cached copy answers immediately (exactly
    // as fast as the old cache-first behavior), while a background fetch
    // refreshes both app-shell cache entries for the *next* launch. This is
    // the one request type that used to require a manual CACHE_NAME bump
    // to ever see a new version — it no longer does.
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match('./index.html').then((cached) => {
          const network = fetch('./index.html', { cache: 'no-store' })
            .then((response) => {
              if (response && response.status === 200 && response.type === 'basic') {
                cache.put('./index.html', response.clone());
                cache.put('./', response.clone());
              }
              return response;
            })
            .catch(() => null);
          // Cached copy wins the race for speed; only fall through to the
          // network promise on a true first-ever load with nothing cached.
          return cached || network;
        })
      )
    );
    return;
  }

  // Everything else (manifest, icons): unchanged cache-first behavior.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
