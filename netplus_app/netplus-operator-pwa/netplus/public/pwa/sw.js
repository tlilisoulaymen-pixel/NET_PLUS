/**
 * NetPlus PWA Service Worker
 * Cache-first strategy for static assets, network-first for API calls
 */

const CACHE_NAME = 'netplus-v2.0.1';
const STATIC_ASSETS = [
  '/assets/netplus/pwa/index.html',
  '/assets/netplus/pwa/app.js',
  '/assets/netplus/pwa/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls — network only
  if (url.pathname.startsWith('/api/')) {
    return; // Let browser handle
  }

  // Static assets — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      );
    })
  );
});

// FCM Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.notification?.title || 'NetPlus';
  const body = data.notification?.body || '';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/assets/netplus/pwa/icons/icon-192.png',
      badge: '/assets/netplus/pwa/icons/icon-192.png',
      data: data.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/netplus-pwa')
  );
});
