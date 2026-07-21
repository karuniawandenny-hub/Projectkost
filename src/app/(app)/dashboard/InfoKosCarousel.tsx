"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const ROTATE_MS = 3000;

export type InfoItem =
  | {
      kind: "announcement";
      id: string;
      title: string;
      body: string;
      createdAtISO: string;
    }
  | {
      kind: "maintenance";
      id: string;
      title: string;
      body: string;
      /** Ditampilkan sebagai "Jadwal: 15 Jun 2026" */
      scheduledDateISO: string;
      /** SCHEDULED | IN_PROGRESS */
      status: string;
      /** PREVENTIVE | CORRECTIVE */
      type: string;
    };

/**
 * Carousel "Informasi Kos" untuk dashboard penghuni. Menggabungkan:
 *  - 5 pengumuman terbaru dari pemilik kos
 *  - Perawatan level kos yang SCHEDULED / IN_PROGRESS
 * Diurut oleh caller (sudah merged & sorted saat props diterima).
 *
 * Animasi: CSS slide-in ringan (opacity + translateX), GPU-accelerated,
 * respect prefers-reduced-motion. Tidak pakai library eksternal supaya
 * bundle tetap kecil.
 *
 * Interaksi:
 *  - Hover / focus card → auto-rotate pause (biar user sempat baca).
 *  - Klik dot indicator → lompat ke slide + pause sementara.
 *  - Klik card → arahkan ke halaman yang relevan (pengumuman atau
 *    detail perawatan).
 */
export function InfoKosCarousel({ items }: { items: InfoItem[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [items.length, paused]);

  // Reset ke 0 kalau daftar item berubah (mis. ada data baru dari server)
  useEffect(() => {
    setIdx(0);
  }, [items.map((i) => `${i.kind}:${i.id}`).join(",")]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Informasi Kos</h3>
          <Link
            href="/announcements"
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Buka Pengumuman
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Belum ada pengumuman atau perawatan terjadwal. Informasi baru akan
          tampil di sini otomatis.
        </p>
      </div>
    );
  }

  const active = items[idx];

  return (
    <div
      className="rounded-xl border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">📢 Informasi Kos</h3>
        <Link
          href="/announcements"
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Lihat semua →
        </Link>
      </div>

      {/*
        key={active.kind + active.id} → force remount saat item berganti
        sehingga CSS animation "animate-info-kos-slide" replay setiap
        transisi. Height min supaya slide tidak jumping saat konten pendek.
      */}
      <div
        key={`${active.kind}:${active.id}`}
        className="animate-info-kos-slide mt-3 min-h-[92px]"
      >
        <SlideCard item={active} />
      </div>

      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={`${it.kind}:${it.id}`}
              type="button"
              onClick={() => {
                setIdx(i);
                setPaused(true);
                setTimeout(() => setPaused(false), ROTATE_MS);
              }}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx
                  ? "w-6 bg-brand-600"
                  : "w-1.5 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SlideCard({ item }: { item: InfoItem }) {
  if (item.kind === "maintenance") {
    const isProgress = item.status === "IN_PROGRESS";
    const isPreventive = item.type === "PREVENTIVE";
    return (
      <Link
        href={`/maintenance/${item.id}`}
        className="block rounded-lg bg-white/70 p-3 transition hover:bg-white"
      >
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold ${
              isPreventive
                ? "bg-sky-100 text-sky-800"
                : "bg-violet-100 text-violet-800"
            }`}
          >
            🛠️ {isPreventive ? "Preventif" : "Korektif"}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold ${
              isProgress
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {isProgress ? "Dalam proses" : "Terjadwal"}
          </span>
          <span className="text-slate-500 tabular-nums">
            Jadwal:{" "}
            {new Date(item.scheduledDateISO).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="mt-1 font-semibold text-slate-800 line-clamp-1">
          {item.title}
        </div>
        {item.body && (
          <p className="mt-0.5 text-sm text-slate-600 line-clamp-2 whitespace-pre-wrap">
            {item.body}
          </p>
        )}
      </Link>
    );
  }
  // announcement
  return (
    <Link
      href="/announcements"
      className="block rounded-lg bg-white/70 p-3 transition hover:bg-white"
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-500 tabular-nums">
        📢 Pengumuman ·{" "}
        {new Date(item.createdAtISO).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </div>
      <div className="mt-0.5 font-semibold text-slate-800 line-clamp-1">
        {item.title}
      </div>
      <p className="mt-1 text-sm text-slate-600 line-clamp-2 whitespace-pre-wrap">
        {item.body}
      </p>
    </Link>
  );
}
