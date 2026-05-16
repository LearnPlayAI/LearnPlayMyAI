// Dynamic cache name that changes with each deployment
// Increment this version number to force cache clear
const CACHE_VERSION = 'v5-runtime-freshness-20260413';
const CACHE_NAME = 'learnplay-' + CACHE_VERSION;
const STATIC_CACHE = 'learnplay-static-' + CACHE_VERSION;

// Install service worker and skip waiting for immediate activation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Only cache essential static assets that don't change often
        return cache.addAll([
          '/manifest.json',
          '/api/public/branding/platform/favicon-1765016548696.png',
          '/api/public/branding/platform/logo-1765016512056.png'
        ]);
      })
  );
  // Skip waiting to activate new service worker immediately
  self.skipWaiting();
});

// Fetch strategy prioritizes runtime freshness for app code.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle different types of requests
  if (request.method !== 'GET') {
    // Don't cache non-GET requests
    return;
  }
  
  // Never cache API requests in SW.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // For JS/CSS assets: network first to avoid stale UI logic across releases.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.tsx')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(request);
      })
    );
  }
  // For HTML pages: network first, fallback to cache.
  else if (url.pathname === '/' || !url.pathname.includes('.')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful HTML responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request);
        })
    );
  }
  // For other static assets: cache first.
  else {
    event.respondWith(
      caches.match(request)
        .then(response => {
          return response || fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(STATIC_CACHE).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          });
        })
    );
  }
});

// Activate service worker and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep current cache and static cache, delete everything else
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});
