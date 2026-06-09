"use client";

import { useState } from "react";

type BackupEntry = {
  name: string;
  size: number;
  modifiedAt: string; // ISO
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupCard({
  backups,
  cronConfigured,
  cronUrl,
}: {
  backups: BackupEntry[];
  cronConfigured: boolean;
  cronUrl: string;
}) {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function trigger() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch(cronUrl, { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        file?: string;
        bytes?: number;
        error?: string;
      };
      if (data.ok) {
        setMsg({
          ok: true,
          text: `Backup berhasil: ${data.file} (${formatBytes(data.bytes ?? 0)}). Refresh halaman untuk lihat di daftar.`,
        });
      } else {
        setMsg({ ok: false, text: data.error ?? "Backup gagal." });
      }
    } catch (e) {
      setMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Gagal menghubungi server.",
      });
    } finally {
      setRunning(false);
    }
  }

  const latest = backups[0];
  const latestAge = latest
    ? hoursAgo(new Date(latest.modifiedAt))
    : null;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Backup Database</h2>
          <p className="mt-1 text-sm text-slate-600">
            Backup harian otomatis ke <code>/data/backups/</code>. Retensi 14
            file terbaru.
          </p>
        </div>
        <span
          className={
            !latest
              ? "badge-red"
              : latestAge !== null && latestAge > 36
                ? "badge-yellow"
                : "badge-green"
          }
        >
          {!latest
            ? "Belum pernah backup"
            : latestAge !== null && latestAge > 36
              ? `Terakhir ${formatAge(latestAge)} lalu`
              : `Sehat (${formatAge(latestAge ?? 0)} lalu)`}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={trigger}
          disabled={running || !cronConfigured}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {running ? "Backup berjalan…" : "Jalankan backup sekarang"}
        </button>
        {!cronConfigured && (
          <span className="text-xs text-amber-700">
            CRON_SECRET belum diset.
          </span>
        )}
      </div>

      {msg && (
        <div
          className={`mt-2 rounded-md px-3 py-2 text-sm ${
            msg.ok
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {backups.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
                <th className="px-3 py-1.5">File</th>
                <th className="px-3 py-1.5">Waktu</th>
                <th className="px-3 py-1.5 text-right">Ukuran</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {backups.slice(0, 7).map((b) => (
                <tr key={b.name}>
                  <td className="px-3 py-1.5 font-mono text-xs">{b.name}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-600">
                    {new Date(b.modifiedAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs">
                    {formatBytes(b.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {backups.length > 7 && (
            <div className="px-3 py-1.5 text-xs text-slate-500">
              +{backups.length - 7} backup lainnya…
            </div>
          )}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          Setup cron harian (recommended: 03:00 WIB)
        </summary>
        <div className="mt-2 space-y-2 text-xs text-slate-700">
          <p>
            Daftarkan URL ini di cron-job.org, jadwal harian{" "}
            <code>03:00</code> timezone <code>Asia/Jakarta</code>:
          </p>
          <code className="block break-all rounded bg-slate-100 p-2">
            {cronUrl || "(CRON_SECRET belum diset)"}
          </code>
          <p className="text-slate-500">
            Method GET. Aktifkan "Notify on failure" di cron-job.org agar dapat
            email kalau backup gagal.
          </p>
        </div>
      </details>
    </div>
  );
}

function hoursAgo(d: Date): number {
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function formatAge(hours: number): string {
  if (hours < 1) return "<1 jam";
  if (hours < 24) return `${Math.floor(hours)} jam`;
  return `${Math.floor(hours / 24)} hari`;
}
