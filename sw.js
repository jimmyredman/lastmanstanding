/* RJG Pricing — offline service worker.
   Network-first for same-origin requests so updates always arrive when there is
   signal; falls back to the cache when offline so the app still works on-site. */
const CACHE = "rjg-pricing-v67";
const PRECACHE = [
  "./index.html",
  "./rjg-pricing.html",
  "./manifest.webmanifest",
  "./vendor/seed-items.json",
  "./icon.svg",
  "./vendor/icon-180.png",
  "./vendor/icon-192.png",
  "./vendor/icon-512.png",
  "./vendor/rjg-logo.png",
  "./vendor/tailwind.css",
  "./vendor/react.min.js",
  "./vendor/react-dom.min.js",
  "./vendor/babel.min.js",
  "./vendor/xlsx.full.min.js",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/html2canvas.min.js",
  "./vendor/three.min.js",
  "./vendor/OrbitControls.js",
  "./vendor/fonts/montserrat-latin-400-normal.woff2",
  "./vendor/fonts/montserrat-latin-600-normal.woff2",
  "./vendor/fonts/montserrat-latin-700-normal.woff2",
  "./vendor/fonts/montserrat-latin-800-normal.woff2",
  "./vendor/fonts/bebas-neue-latin-400-normal.woff2"
];

self.addEventListener("install", (e) => {
  // Cache each item on its own so one missing/404 file (e.g. a filename that
  // differs between environments) can't abort the whole precache.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

// let the page tell a waiting worker to take over straight away
self.addEventListener("message", (e) => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Network-first: always try the network, cache the fresh copy, fall back to cache offline.
    e.respondWith(
      fetch(req).then((res) => {
        try { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } catch (_) {}
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html") || caches.match("./rjg-pricing.html")))
    );
    return;
  }

  // Cross-origin (none by default — everything is vendored): cache-first.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      try { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } catch (_) {}
      return res;
    }).catch(() => hit))
  );
});
