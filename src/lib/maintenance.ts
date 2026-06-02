/**
 * Helpers untuk fitur Maintenance.
 *
 * Mencakup: konstanta enum, formatter label Indonesia, kalkulasi tanggal
 * recurrence berikutnya, dan validator field.
 */

export const MAINTENANCE_TYPES = ["PREVENTIVE", "CORRECTIVE"] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export const MAINTENANCE_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/** Pilihan interval bulan untuk recurrence preventif. */
export const RECURRENCE_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Setiap bulan" },
  { value: 3, label: "Setiap 3 bulan" },
  { value: 6, label: "Setiap 6 bulan" },
  { value: 12, label: "Setiap tahun" },
];

export function typeLabel(t: string): string {
  if (t === "PREVENTIVE") return "Preventif";
  if (t === "CORRECTIVE") return "Korektif";
  return t;
}

export function statusLabel(s: string): string {
  switch (s) {
    case "SCHEDULED":
      return "Terjadwal";
    case "IN_PROGRESS":
      return "Dalam proses";
    case "COMPLETED":
      return "Selesai";
    case "CANCELLED":
      return "Dibatalkan";
    default:
      return s;
  }
}

export function statusBadgeClass(s: string): string {
  switch (s) {
    case "SCHEDULED":
      return "badge-slate";
    case "IN_PROGRESS":
      return "badge-yellow";
    case "COMPLETED":
      return "badge-green";
    case "CANCELLED":
      return "badge-red";
    default:
      return "badge-slate";
  }
}

/**
 * Hitung tanggal jadwal berikutnya setelah maintenance selesai.
 * Pakai tanggal selesai + interval bulan supaya jadwal mengikuti
 * kenyataan kerja (mis. service AC telat 1 bulan → siklus berikutnya
 * juga mundur 1 bulan, bukan tetap di tanggal lama yang sudah lewat).
 */
export function nextScheduledDate(
  completedDate: Date,
  intervalMonths: number
): Date {
  const next = new Date(completedDate);
  next.setMonth(next.getMonth() + intervalMonths);
  return next;
}

export function formatDateID(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatRupiah(n: number | null | undefined): string {
  if (n == null) return "-";
  return "Rp " + n.toLocaleString("id-ID");
}
