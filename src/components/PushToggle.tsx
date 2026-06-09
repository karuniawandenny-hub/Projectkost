"use client";

import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * VAPID public key (base64url) → ArrayBuffer untuk applicationServerKey.
 * Sengaja kembalikan ArrayBuffer (bukan Uint8Array generik) supaya cocok
 * dengan tipe BufferSource yang ketat di lib DOM terbaru.
 */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

type State = "loading" | "unsupported" | "off" | "on" | "denied" | "working";/**
 * Tombol aktif/matikan notifikasi Web Push di device ini. Disimpan
 * per-device (1 user bisa langganan dari beberapa HP). Notifikasi
 * reminder pembayaran, pengumuman, dan update perawatan akan masuk ke
 * HP meski app tidak dibuka.
 */
/** Apakah app sedang berjalan terpasang (dari ikon home screen), bukan tab browser. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari pakai properti non-standar ini untuk Home Screen web app.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ menyamar sebagai Mac; deteksi lewat touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [testing, setTesting] = useState(false);
  // Diagnostik runtime — membantu menelusuri masalah Web Push di iOS.
  const [diag, setDiag] = useState<{
    standalone: boolean;
    ios: boolean;
    permission: NotificationPermission | "n/a";
  } | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    const ios = isIOS();
    const standalone = isStandalone();
    setDiag({
      standalone,
      ios,
      permission: "Notification" in window ? Notification.permission : "n/a",
    });

    if (!supported || !VAPID_PUBLIC_KEY) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, [supported]);

  async function enable() {
    setError(null);
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      setDiag((d) => (d ? { ...d, permission } : d));
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY!),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Gagal menyimpan langganan di server.");
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengaktifkan notifikasi.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("working");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        reason?: string;
        devices?: number;
        hosts?: string[];
      };
      if (data.ok) {
        // Tampilkan ke berapa & device mana terkirim. Kalau iPhone Anda
        // tidak termasuk, host-nya tidak akan ada "apple".
        const hasApple = (data.hosts ?? []).some((h) => h.includes("apple"));
        const where = (data.hosts ?? [])
          .map((h) =>
            h.includes("apple")
              ? "iPhone/iPad"
              : h.includes("google") || h.includes("fcm")
                ? "Chrome/Android"
                : h.includes("mozilla")
                  ? "Firefox"
                  : h
          )
          .join(", ");
        setTestMsg({
          ok: true,
          text: `Terkirim ke ${data.devices ?? 0} device${
            where ? ` (${where})` : ""
          }.${
            hasApple
              ? " Cek banner di iPhone Anda."
              : " ⚠️ iPhone ini belum termasuk — aktifkan dulu dari app yang dibuka via ikon home screen."
          }`,
        });
      } else {
        setTestMsg({ ok: false, text: data.reason ?? "Gagal mengirim percobaan." });
      }
    } catch {
      setTestMsg({ ok: false, text: "Gagal menghubungi server." });
    } finally {
      setTesting(false);
    }
  }

  // Panel status kecil — tampil di semua kondisi supaya mudah menelusuri
  // masalah (terutama di iOS yang ketat soal Web Push).
  const statusPanel = diag && (
    <div className="mt-2 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
      <div>
        Mode:{" "}
        <span className={diag.standalone ? "text-emerald-700" : "text-amber-700"}>
          {diag.standalone ? "Terpasang (home screen) ✓" : "Browser — belum terpasang"}
        </span>
      </div>
      <div>
        Izin notifikasi:{" "}
        <span
          className={
            diag.permission === "granted"
              ? "text-emerald-700"
              : diag.permission === "denied"
                ? "text-red-600"
                : "text-slate-600"
          }
        >
          {diag.permission === "granted"
            ? "Diizinkan ✓"
            : diag.permission === "denied"
              ? "Diblokir"
              : diag.permission === "default"
                ? "Belum diminta"
                : "Tidak tersedia"}
        </span>
      </div>
      <div>
        Langganan device ini:{" "}
        <span className={state === "on" ? "text-emerald-700" : "text-slate-600"}>
          {state === "on" ? "Aktif ✓" : "Belum"}
        </span>
      </div>
    </div>
  );

  // iOS: Web Push HANYA jalan dari app terpasang. Kalau dibuka via Safari,
  // beri instruksi pasti, bukan sekadar "tidak didukung".
  const iosBrowserWarning = diag?.ios && !diag.standalone && (
    <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <strong>Notifikasi iPhone butuh app terpasang.</strong> Di Safari, tap
      tombol Bagikan (kotak panah ↑) → <strong>Add to Home Screen</strong> →
      Add. Lalu <strong>tutup Safari</strong> dan buka aplikasi dari ikon di
      home screen — aktifkan notifikasi dari sana.
    </div>
  );

  if (state === "loading") {
    return <div className="text-xs text-slate-400">Memeriksa dukungan notifikasi…</div>;
  }
  if (state === "unsupported") {
    return (
      <div>
        {iosBrowserWarning}
        {!diag?.ios && (
          <div className="text-xs text-slate-500">
            Notifikasi push belum tersedia di browser/device ini. Buka lewat
            Chrome/Safari terbaru dan pasang aplikasi (Add to Home Screen)
            untuk mengaktifkannya.
          </div>
        )}
        {diag?.ios && !diag.standalone ? null : (
          <div className="text-xs text-slate-500">
            Pastikan iOS Anda versi 16.4 atau lebih baru.
          </div>
        )}
        {statusPanel}
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className="text-xs text-amber-700">
        Notifikasi diblokir. Buka Setelan iPhone → Notifikasi → Kos Baiti →
        aktifkan Izinkan Notifikasi, lalu muat ulang halaman ini.
        {statusPanel}
      </div>
    );
  }

  const on = state === "on";
  return (
    <div>
      {iosBrowserWarning}
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={state === "working"}
        className={
          on
            ? "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            : "btn-primary text-sm"
        }
      >
        {state === "working"
          ? "Memproses…"
          : on
            ? "🔔 Notifikasi aktif di device ini — matikan"
            : "🔔 Aktifkan notifikasi di device ini"}
      </button>
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}

      {on && (
        <div className="mt-2">
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="text-sm text-brand-700 hover:underline disabled:opacity-50"
          >
            {testing ? "Mengirim…" : "Kirim notifikasi percobaan →"}
          </button>
          {testMsg && (
            <div
              className={`mt-1 text-xs ${
                testMsg.ok ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {testMsg.text}
            </div>
          )}
        </div>
      )}
      {statusPanel}
    </div>
  );
}
