/* RJG Pricing — offline service worker.
   Runtime cache-first with network fallback so the app + its CDN libraries
   keep working on-site once they've been loaded once. */
const CACHE = "rjg-pricing-v10";
const PRECACHE = [
  "./rjg-pricing.html",
  "./manifest.webmanifest",
  "./icon.svg",
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
  "./vendor/fonts/montserrat-latin-400-normal.woff2",
  "./vendor/fonts/montserrat-latin-600-normal.woff2",
  "./vendor/fonts/montserrat-latin-700-normal.woff2",
  "./vendor/fonts/montserrat-latin-800-normal.woff2",
  "./vendor/fonts/bebas-neue-latin-400-normal.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

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
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Cache successful same-origin and opaque CDN responses for next time.
        try {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        } catch (_) {}
        return res;
      }).catch(() => hit);
    })
  );
});
