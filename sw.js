const CACHE_NAME = 'framealch-cache-v2';
const LUT_CACHE_NAME = 'framealch-luts-cache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/index.css',
  './js/app.js',
  './js/webgl.js',
  './js/parser.js',
  './js/exif.js',
  './assets/favicon.svg',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== LUT_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (!e.request.url.startsWith('http') || e.request.method !== 'GET') {
    return;
  }

  const isLutRequest = e.request.url.includes('raw.githubusercontent.com') || e.request.url.includes('Film-Luts');

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(isLutRequest ? LUT_CACHE_NAME : CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return new Response('Offline resource not cached', { status: 408 });
      });
    })
  );
});
