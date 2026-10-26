// Offline support for Budgie. Bump VERSION whenever any file changes.
const VERSION = "1.1.0";
const CACHE = "budgie-" + VERSION;
const FILES = ["./", "./index.html", "./app.js", "./engine.js", "./demo.js", "./themes.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./maskable-512.png", "./icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("budgie-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // fonts: cache them once they've loaded; the Google Sheet always goes to the network
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; })));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = req.mode === "navigate" ? (await cache.match("./index.html")) || (await cache.match("./")) : await cache.match(req, {ignoreSearch: true});
    if (hit) return hit;
    try { return await fetch(req); } catch (err) { return (await cache.match("./index.html")) || Response.error(); }
  })());
});
