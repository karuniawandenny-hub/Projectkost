/**
 * Service Worker minimal untuk Kos Baiti.
 *
 * Strategi:
 * - Static assets (logo, manifest, /offline): cache-first
 * - Halaman HTML (navigation): network-first dengan offline fallback
 * - API & route Next.js dynamic: NETWORK ONLY (jangan cache - data fresh)
 *
 * SENGAJA dibuat ringan: tidak intercept POST, tidak cache request
 * dengan token/cookie, tidak background-sync. Tujuan utama: bikin app
 * installable + tampilkan halaman offline yg ramah saat user tidak ada
 * koneksi.
 */

const CACHE_VERSION = "kos-baiti-v1";
const STATIC_ASSETS = [
  "/manifest.json",
  "/kos-baiti-logo.png",
  "/offline",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Skip non-GET dan request dengan query yang tidak ingin kita cache.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip API routes — selalu langsung ke network.
  if (url.pathname.startsWith("/api/")) return;

  // Static assets dari /kos-baiti-logo.png, /manifest.json: cache-first.
  if (STATIC_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Navigation request (HTML): network-first, fallback ke /offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache offline page kalau berhasil di-fetch.
          if (url.pathname === "/offline") {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match("/offline").then(
            (cached) =>
              cached ||
              new Response("Offline", {
                status: 503,
                headers: { "Content-Type": "text/plain" },
              })
          )
        )
    );
  }
});
