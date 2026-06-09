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

const CACHE_VERSION = "kos-baiti-v3";
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

// ===== Web Push =====
// Tampilkan notifikasi saat server kirim push. Payload JSON:
// { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Kos Baiti", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Kos Baiti";
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klik notifikasi → fokus tab app yang sudah buka, atau buka tab baru
// ke URL tujuan notifikasi.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
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
