"use client";

type Props = {
  label?: string;
  className?: string;
};

/**
 * Tombol cetak universal yang trigger window.print() — browser native
 * handle save-as-PDF dialog. Dipakai di halaman kuitansi, kontrak, dan
 * laporan. Label & class bisa di-customize per call-site.
 */
export function PrintButton({
  label = "🖨️ Cetak / Save PDF",
  className = "rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700",
}: Props) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {label}
    </button>
  );
}
