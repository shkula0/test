// Service worker: zapisuje pliki aplikacji, żeby działała szybko i bez internetu.
// Po zmianie plików aplikacji podbij numer wersji, aby telefony pobrały nową wersję.
const CACHE = 'trener-v32';
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
  'js/plan-utils.js',
  'js/workouts.js',
  'js/summary.js',
  'js/export.js',
  'js/routines.js',
  'js/passes.js',
  'js/push.js',
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

// Powiadomienie push: { title, body, url } z funkcji Supabase „push”.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'Trener', body: event.data?.text() ?? '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Trener', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-64.png',
    data: { url: data.url || '#/' },
  }));
});

// Stuknięcie w powiadomienie: otwiera aplikację (albo przełącza na otwartą) na właściwym ekranie.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '#/', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => w.url.startsWith(self.registration.scope));
    if (open) return open.navigate(target).catch(() => null).then((w) => (w ?? open).focus());
    return self.clients.openWindow(target);
  }));
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
