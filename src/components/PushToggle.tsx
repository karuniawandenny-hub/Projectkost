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
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [testing, setTesting] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
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
      const data = (await res.json()) as { ok: boolean; reason?: string };
      setTestMsg(
        data.ok
          ? { ok: true, text: "Terkirim! Cek notifikasi di HP Anda." }
          : { ok: false, text: data.reason ?? "Gagal mengirim percobaan." }
      );
    } catch {
      setTestMsg({ ok: false, text: "Gagal menghubungi server." });
    } finally {
      setTesting(false);
    }
  }

  if (state === "loading") {
    return <div className="text-xs text-slate-400">Memeriksa dukungan notifikasi…</div>;
  }
  if (state === "unsupported") {
    return (
      <div className="text-xs text-slate-500">
        Notifikasi push belum tersedia di browser/device ini. Buka lewat
        Chrome/Safari terbaru dan pasang aplikasi (Add to Home Screen) untuk
        mengaktifkannya.
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className="text-xs text-amber-700">
        Notifikasi diblokir di pengaturan browser. Izinkan notifikasi untuk
        situs ini dari setelan browser, lalu muat ulang halaman.
      </div>
    );
  }

  const on = state === "on";
  return (
    <div>
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
    </div>
  );
}
