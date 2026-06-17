"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Auto-logout setelah idle. Implementasi client-side dengan cross-tab
 * sync lewat localStorage.
 *
 * Aturan idle:
 *  - TENANT: 30 menit
 *  - OWNER & ADMIN: 15 menit (data lebih sensitif)
 * Warning modal muncul 60 detik sebelum logout dengan countdown +
 * tombol "Tetap Login" untuk reset timer.
 *
 * Cross-tab: tab A & B share `kos_last_activity` di localStorage.
 * Kalau Anda aktif di tab A, tab B tidak akan logout — karena polling
 * di tab B baca lastActivity yang baru saja di-update tab A.
 *
 * Catatan: ini PROTEKSI UX + DEFAULT secure. Server-side cookie tetap
 * berlaku 30 hari (untuk "ingat saya"), tapi client otomatis bersihkan
 * sesi saat idle. Server-side sliding expiration adalah enhancement
 * berikutnya kalau dibutuhkan compliance lebih ketat.
 */

type Role = "TENANT" | "OWNER" | "ADMIN";

const IDLE_MS: Record<Role, number> = {
  TENANT: 30 * 60 * 1000,
  OWNER: 15 * 60 * 1000,
  ADMIN: 15 * 60 * 1000,
};
const WARNING_MS = 60 * 1000;
const POLL_MS = 1000;
const ACTIVITY_KEY = "kos_last_activity";
// Throttle penulisan ke localStorage supaya tidak hammer di event yang
// fire sangat sering (mousemove). Tulis paling sering tiap 5 detik.
const WRITE_THROTTLE_MS = 5000;

export function IdleLogoutGuard({ role }: { role: Role }) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(
    Math.floor(WARNING_MS / 1000)
  );
  const lastWriteRef = useRef<number>(0);
  const loggingOutRef = useRef<boolean>(false);

  const idleMs = IDLE_MS[role];
  const warningAt = idleMs - WARNING_MS;

  const recordActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastWriteRef.current < WRITE_THROTTLE_MS) return;
    lastWriteRef.current = now;
    try {
      localStorage.setItem(ACTIVITY_KEY, String(now));
    } catch {
      // localStorage bisa disabled (mode privacy ekstrim) — fallback
      // diam-diam. Worst case: timer tetap jalan, tab single mode.
    }
  }, []);

  const doLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      await fetch("/logout", { method: "POST" });
    } catch {
      // Network error — tetap redirect ke login. Cookie mungkin masih
      // ada di browser tapi user setidaknya tidak melihat halaman
      // protected.
    }
    try {
      localStorage.removeItem(ACTIVITY_KEY);
    } catch {
      // ignore
    }
    router.push("/login?reason=idle");
  }, [router]);

  const stayLoggedIn = useCallback(() => {
    lastWriteRef.current = 0;
    recordActivity();
    setShowWarning(false);
  }, [recordActivity]);

  useEffect(() => {
    // Mount = aktivitas baru (fresh login / navigation / reload).
    // Reset lastWrite supaya recordActivity langsung tulis ke storage.
    lastWriteRef.current = 0;
    recordActivity();

    const events: (keyof WindowEventMap)[] = [
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "mousemove",
    ];
    const onActivity = () => recordActivity();
    for (const e of events) {
      window.addEventListener(e, onActivity, { passive: true });
    }

    // Polling tiap detik: cek idle time + update warning state.
    // Memilih polling (bukan setTimeout chain) karena sumber kebenaran
    // ada di localStorage yang bisa ter-update tab lain — pendekatan
    // ini lebih simpel & robust untuk cross-tab sync.
    const tick = setInterval(() => {
      let last: number;
      try {
        const stored = localStorage.getItem(ACTIVITY_KEY);
        last = stored ? Number(stored) : Date.now();
        if (!Number.isFinite(last)) last = Date.now();
      } catch {
        last = Date.now();
      }
      const idleFor = Date.now() - last;

      if (idleFor >= idleMs) {
        void doLogout();
        return;
      }
      if (idleFor >= warningAt) {
        if (!showWarning) setShowWarning(true);
        setSecondsLeft(Math.max(0, Math.ceil((idleMs - idleFor) / 1000)));
      } else if (showWarning) {
        // Activity di tab lain → tab ini juga keluar dari warning state.
        setShowWarning(false);
      }
    }, POLL_MS);

    return () => {
      for (const e of events) {
        window.removeEventListener(e, onActivity);
      }
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleMs, warningAt, doLogout, recordActivity]);

  if (!showWarning) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h2
          id="idle-warning-title"
          className="text-lg font-bold text-slate-800"
        >
          Sesi akan berakhir
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Anda tidak aktif beberapa saat. Aplikasi akan logout otomatis dalam{" "}
          <strong className="text-red-600 tabular-nums">
            {secondsLeft}
          </strong>{" "}
          detik untuk menjaga keamanan akun Anda.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={doLogout}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Logout Sekarang
          </button>
          <button
            type="button"
            onClick={stayLoggedIn}
            autoFocus
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Tetap Login
          </button>
        </div>
      </div>
    </div>
  );
}
