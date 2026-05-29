"use client";

import { useEffect } from "react";

/**
 * Daftarkan service worker /sw.js saat app dimuat di browser.
 * Hanya jalan di production (SW di dev cache versi lama).
 *
 * useEffect sudah pasti jalan post-hydration, jadi tidak perlu
 * dance dengan load event — register langsung saja.
 */
export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // ignore - SW gagal register tidak break app
    });
  }, []);

  return null;
}
