// Service worker: zapisuje pliki aplikacji, żeby działała szybko i bez internetu.
// Po zmianie plików aplikacji podbij numer wersji, aby telefony pobrały nową wersję.
const CACHE = 'trener-v6';
const ASSETS = [
  './',
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/ui.js',
  'js/icons.js',
  'js/chart.js',
  'js/library.js',
  'js/media.js',
  'js/measurements.js',
  'js/data/index.js',
  'js/data/demo.js',
  'js/data/supabase.js',
  'vendor/supabase.js',
  'icons/logo-256.png',
  'icons/favicon-64.png',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Najpierw sieć (świeża wersja), a bez internetu – kopia z pamięci.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
