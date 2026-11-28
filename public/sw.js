// Service worker di Giro: rete prima, cache come ripiego → l'app si apre anche offline.
// ponytail: network-first su tutto lo stesso dominio (gli asset non sono versionati). Con asset hashati → cache-first.
const CACHE = "giro-v1";
const CORE = ["./", "index.html", "style.css", "i18n.js", "trailtrace.js", "gpxtools.js", "navigate.js",
  "flight3d.js", "app.js", "contacts.js", "mercatino.js", "workshop.js", "firebase-config.js",
  "boot.js", "hit.js", "install.js", "manifest.json", "icon-192.png", "icon-512.png"];
const CDN = ["https://unpkg.com/leaflet@1.9.4/", "https://www.gstatic.com/firebasejs/"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  // Mai in cache: API, Firestore/Auth (hanno la loro gestione), tile delle mappe (troppe).
  if (same && url.pathname.startsWith("/api/")) return;
  if (!same && !CDN.some((p) => req.url.startsWith(p))) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
