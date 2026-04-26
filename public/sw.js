// NutriSense Service Worker
// Strategy:
//   - Static assets (_next/static, icons, fonts): cache-first with long TTL
//   - App pages: network-first, fallback to cache
//   - API routes: network-only (never cache — always fresh data)

const CACHE_VERSION = "v1";
const STATIC_CACHE = `ns-static-${CACHE_VERSION}`;
const PAGES_CACHE  = `ns-pages-${CACHE_VERSION}`;

const STATIC_PATTERNS = [
  /\/_next\/static\//,
  /\/api\/pwa-icon/,
];

const API_PATTERNS = [
  /\/api\//,
];

// ── Install: skip waiting so the new SW activates immediately ──────────────
self.addEventListener("install", () => {
  self.skipWaiting();
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route to the right strategy ────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never intercept API routes — always go to network
  if (API_PATTERNS.some((p) => p.test(url.pathname))) return;

  // Static assets: cache-first
  if (STATIC_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Pages / navigation: network-first
  event.respondWith(networkFirst(request, PAGES_CACHE));
});

// ── Cache-first strategy ───────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

// ── Network-first strategy ─────────────────────────────────────────────────
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
