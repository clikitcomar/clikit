const CACHE_NAME = "clikit-static-v5";
const PRODUCTS_CACHE = "clikit-products-v1";

const STATIC_ASSETS = ["/manifest.json"];

const CACHEABLE_API_PATTERNS = [
  /^\/api\/productos\?view=grid/,
  /^\/api\/categorias/,
];

function shouldHandleAsStatic(request) {
  if (request.method !== "GET") return false;
  if (request.mode === "navigate") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;

  return (
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/icons/")
  );
}

function shouldCacheApi(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(url.pathname + url.search));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== PRODUCTS_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (shouldCacheApi(request)) {
    event.respondWith(
      caches.open(PRODUCTS_CACHE).then((cache) => {
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            return cache.match(request);
          });
      })
    );
    return;
  }

  if (shouldHandleAsStatic(request)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });

        return cachedResponse || fetchPromise;
      })
    );
  }
});
