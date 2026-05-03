// Service Worker for Tokyo Metro Run PWA
// Strategy:
//   - Precache the app shell on install
//   - Navigation: network-first (fallback to cached index.html for offline)
//   - Static assets: cache-first with background refresh (stale-while-revalidate)
//   - Firebase Realtime DB / Auth: pass-through (realtime data must not be cached)

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/terms.html',
  '/privacy.html',
  '/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-180.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/icons/favicon-32.png',
];

// Hosts that must always go to the network (realtime data, auth tokens)
const NETWORK_ONLY_HOSTS = [
  /\.firebasedatabase\.app$/,
  /\.firebaseio\.com$/,
  /^identitytoolkit\.googleapis\.com$/,
  /^securetoken\.googleapis\.com$/,
];

function isNetworkOnly(url) {
  return NETWORK_ONLY_HOSTS.some(re => re.test(url.hostname));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[sw] precache failed', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (isNetworkOnly(url)) return; // let the browser handle it normally

  // Navigation requests: network-first, fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Static & CDN assets: cache-first with background refresh
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response && (response.status === 200 || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Allow the page to trigger an immediate update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
