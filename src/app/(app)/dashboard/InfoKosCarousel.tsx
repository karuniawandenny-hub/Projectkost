"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const ROTATE_MS = 3000;

export type InfoItem = {
  id: string;
  title: string;
  body: string;
  createdAtISO: string;
};

/**
 * Carousel "Informasi Kos" untuk dashboard penghuni. Menampilkan 5
 * pengumuman terbaru; slide otomatis berputar tiap 3 detik.
 *
 * Interaksi:
 *  - Hover / focus di area card → auto-rotate pause (biar user sempat
 *    baca teks panjang).
 *  - Klik dot indicator untuk lompat ke slide tertentu.
 *  - Ada tombol "Lihat semua" ke /announcements untuk detail lengkap.
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

  // Kalau slice items berubah (misal ada pengumuman baru), reset ke 0.
  useEffect(() => {
    setIdx(0);
  }, [items.map((i) => i.id).join(",")]);

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
          Belum ada pengumuman dari pemilik kos. Pengumuman baru akan tampil
          di sini otomatis.
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

      {/* Slide content — pakai key supaya animation reset tiap ganti item */}
      <Link
        key={active.id}
        href="/announcements"
        className="mt-3 block rounded-lg bg-white/70 p-3 transition hover:bg-white"
      >
        <div className="text-[11px] uppercase tracking-wide text-slate-500 tabular-nums">
          {new Date(active.createdAtISO).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
        <div className="mt-0.5 font-semibold text-slate-800 line-clamp-1">
          {active.title}
        </div>
        <p className="mt-1 text-sm text-slate-600 line-clamp-2 whitespace-pre-wrap">
          {active.body}
        </p>
      </Link>

      {/* Dot indicator */}
      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                setIdx(i);
                // Reset timer supaya user lihat slide ini penuh sebelum auto-next
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
