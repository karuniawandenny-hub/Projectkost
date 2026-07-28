/**
 * Helper terpusat untuk menghitung "berapa hari telat" sebuah tagihan.
 *
 * Aturan yang dipakai di seluruh app (harus konsisten):
 *  - Hanya status DUE & REJECTED yang bisa "telat":
 *      DUE      = penghuni belum upload bukti
 *      REJECTED = bukti sebelumnya ditolak, penghuni harus kirim baru
 *  - PENDING (bukti sudah dikirim, menunggu verifikasi) TIDAK dihitung
 *    telat — bola sudah di tangan owner.
 *  - VERIFIED sudah lunas, tidak relevan.
 *  - Grace period: H+1 (tepat sehari setelah due date sudah "telat 1
 *    hari"). Owner memilih tegas — tidak ada toleransi otomatis.
 *  - Rentang warna:
 *      1-3 hari  = amber (perlu perhatian)
 *      4-7 hari  = orange (perlu follow-up)
 *      >7 hari   = red (masalah serius)
 */

export type OverdueStatus = "DUE" | "PENDING" | "VERIFIED" | "REJECTED";

export type OverdueLevel = "none" | "warn" | "urgent" | "critical";

export type OverdueInfo = {
  daysOverdue: number;
  level: OverdueLevel;
};

/**
 * Hitung berapa hari telat sebuah tagihan. Null kalau tidak
 * bisa/relevan telat (status PENDING/VERIFIED, atau due date belum
 * lewat).
 */
export function computeOverdue(
  dueDate: Date | string,
  status: OverdueStatus,
  now: Date = new Date()
): OverdueInfo | null {
  if (status !== "DUE" && status !== "REJECTED") return null;

  // Normalize ke midnight lokal supaya perhitungan hari akurat.
  const due =
    typeof dueDate === "string" ? new Date(dueDate) : new Date(dueDate);
  const dueMid = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate()
  );
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = nowMid.getTime() - dueMid.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return null;

  const level: OverdueLevel =
    diffDays > 7 ? "critical" : diffDays > 3 ? "urgent" : "warn";
  return { daysOverdue: diffDays, level };
}

/**
 * Tailwind class pair untuk badge overdue: {bg-*, text-*}.
 * Pakai spread di className: `${cls(level).bg} ${cls(level).text}`.
 */
export function overdueBadgeClass(level: OverdueLevel): string {
  switch (level) {
    case "warn":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "urgent":
      return "bg-orange-100 text-orange-800 border border-orange-300";
    case "critical":
      return "bg-red-100 text-red-800 border border-red-300";
    default:
      return "";
  }
}

/**
 * Label bahasa Indonesia dengan penekanan level:
 *  - "Terlambat 2 hari"
 *  - "Terlambat 5 hari" (urgent)
 *  - "Terlambat 30 hari — mohon follow-up" (critical)
 */
export function overdueLabel(info: OverdueInfo): string {
  const d = info.daysOverdue;
  return `Terlambat ${d} hari`;
}
