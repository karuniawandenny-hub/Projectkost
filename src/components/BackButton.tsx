"use client";

import { useRouter } from "next/navigation";

type Props = {
  label?: string;
  /** Tujuan kalau halaman dibuka langsung (tanpa history dalam app). */
  fallbackHref?: string;
  className?: string;
};

/**
 * Tombol "Kembali" universal. Pakai router.back() kalau ada history
 * dalam sesi app; kalau halaman dibuka langsung (mis. dari link yang
 * di-share, history cuma 1 entri), fallback ke href yang diberikan
 * supaya user tidak terjebak.
 */
export function BackButton({
  label = "← Kembali",
  fallbackHref = "/dashboard",
  className = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50",
}: Props) {
  const router = useRouter();

  function onClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}
