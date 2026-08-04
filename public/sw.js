// Pawls service worker — auto-updating with network-first HTML + versioned caches
const CACHE_PREFIX = 'pawls-v';
const BUILD_VERSION = '{{BUILD_TIME}}';

const STATIC_CACHE = CACHE_PREFIX + BUILD_VERSION;

// Assets we pre-cache on install
const PRECACHE_URLS = ['/'];

// Network-first for HTML (always get fresh content), cache for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // HTML pages: network-first so users always get the latest build
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first with network fallback
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/logo') ||
    url.pathname.startsWith('/icon') ||
    url.pathname.startsWith('/apple-touch-icon') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(event.request));
});

// Install: pre-cache and take over immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Claim all clients so the new SW controls them immediately
      return self.clients.claim();
    })
  );
});

// Network-first strategy: try network, fall back to cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Cache the fresh response
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline — please check your connection.', { status: 503 });
  }
}

// Cache-first strategy: try cache, fall back to network
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}
