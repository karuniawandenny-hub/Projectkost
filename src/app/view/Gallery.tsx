"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";

function isPdfUrl(url: string): boolean {
  return url.split("?")[0].toLowerCase().endsWith(".pdf");
}

/**
 * Galeri lampiran in-app dengan navigasi prev/next. Menerima seluruh
 * daftar foto + index awal dari server (sudah tervalidasi & ter-auth).
 *
 * Fitur:
 *  - Tombol ‹ / › di kiri-kanan (muncul kalau >1 file)
 *  - Keyboard ArrowLeft / ArrowRight
 *  - Counter "2 / 5" + strip thumbnail yang bisa diklik
 *  - Tombol Kembali & Unduh (mengikuti file yang sedang aktif)
 *  - Navigasi wrap-around (foto terakhir → next → foto pertama)
 */
export function Gallery({
  srcs,
  title,
  initialIndex,
}: {
  srcs: string[];
  title: string;
  initialIndex: number;
}) {
  const count = srcs.length;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), count - 1)
  );
  const multi = count > 1;
  const current = srcs[index];

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + count) % count),
    [count]
  );
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);

  useEffect(() => {
    if (!multi) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [multi, prev, next]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-900">
      <header className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-3">
        <BackButton
          label="← Kembali"
          className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600"
        />
        <div className="min-w-0 flex-1 truncate text-center text-sm font-medium text-slate-200">
          {title}
          {multi && (
            <span className="ml-2 text-slate-400">
              {index + 1} / {count}
            </span>
          )}
        </div>
        <a
          href={current}
          download
          className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600"
        >
          ⬇ Unduh
        </a>
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        {multi && (
          <button
            type="button"
            onClick={prev}
            aria-label="Foto sebelumnya"
            className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-slate-800/80 text-2xl text-white hover:bg-slate-700"
          >
            ‹
          </button>
        )}

        {isPdfUrl(current) ? (
          <iframe
            src={current}
            title={title}
            className="h-full min-h-[80vh] w-full max-w-4xl rounded bg-white"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={current}
            alt={`${title} ${index + 1}`}
            className="max-h-full max-w-full rounded object-contain"
          />
        )}

        {multi && (
          <button
            type="button"
            onClick={next}
            aria-label="Foto berikutnya"
            className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-slate-800/80 text-2xl text-white hover:bg-slate-700"
          >
            ›
          </button>
        )}
      </div>

      {multi && (
        <div className="flex gap-2 overflow-x-auto border-t border-slate-700 bg-slate-800 px-4 py-3">
          {srcs.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Lihat foto ${i + 1}`}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded border-2 ${
                i === index
                  ? "border-brand-400"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {isPdfUrl(s) ? (
                <span className="grid h-full w-full place-items-center bg-slate-700 text-xs text-slate-200">
                  PDF
                </span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={s}
                  alt={`Thumbnail ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
