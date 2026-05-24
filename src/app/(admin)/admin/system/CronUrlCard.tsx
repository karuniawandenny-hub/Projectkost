"use client";

import { useState } from "react";

/**
 * Card khusus admin: tampilkan URL cron lengkap (dengan token embedded)
 * supaya admin bisa langsung copy-paste ke cron-job.org tanpa harus
 * tahu CRON_SECRET secara manual.
 *
 * URL hanya dirender di komponen ini (sudah di-gate oleh admin layout
 * + page yang hanya render untuk role ADMIN).
 */
export function CronUrlCard({ url, configured }: { url: string; configured: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        ⚠️ <code>CRON_SECRET</code> belum di-set di environment. Tambahkan di
        Railway Variables, redeploy, lalu refresh halaman ini.
      </div>
    );
  }

  const masked = url.replace(/token=[^&]+/, "token=••••••••••••");

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-600 mb-1">URL Cron lengkap</div>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={revealed ? url : masked}
          className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium hover:bg-slate-100"
        >
          {revealed ? "Sembunyikan" : "Tampilkan"}
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          {copied ? "✓ Tersalin" : "Salin"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        URL ini berisi <code>CRON_SECRET</code>. Hanya bagikan ke layanan cron
        terpercaya. Jangan kirim via chat/email tanpa enkripsi.
      </p>
    </div>
  );
}
