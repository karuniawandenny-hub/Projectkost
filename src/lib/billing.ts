/**
 * Logika billing anniversary-based: jatuh tempo tiap bulan = tanggal yang
 * sama dengan tanggal mulai sewa. Bila tanggal lewat akhir bulan (mis. 31
 * di Februari), otomatis di-clamp ke hari terakhir bulan itu.
 *
 * Periode yang dibayar = bulan dari due date (Apr 5 = bayar periode April).
 */

export const DAY_MS = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysInMonth(year: number, monthIdx: number) {
  return new Date(year, monthIdx + 1, 0).getDate();
}
function clampDay(year: number, monthIdx: number, day: number) {
  return Math.min(day, daysInMonth(year, monthIdx));
}

/**
 * Hitung tanggal anniversary di bulan tertentu.
 * `monthIdx` 0-11.
 */
export function anniversaryInMonth(
  startDate: Date,
  year: number,
  monthIdx: number
): Date {
  const day = clampDay(year, monthIdx, startDate.getDate());
  return new Date(year, monthIdx, day);
}

/**
 * Tanggal jatuh tempo TERDEKAT ke depan (inklusif hari ini).
 *  - Jika hari ini <= anniversary bulan ini -> anniversary bulan ini.
 *  - Selain itu -> anniversary bulan depan.
 */
export function nextDueDate(startDate: Date, today: Date = new Date()): Date {
  const t0 = startOfDay(today);
  const thisM = anniversaryInMonth(startDate, t0.getFullYear(), t0.getMonth());
  if (t0.getTime() <= thisM.getTime()) return thisM;
  const m = t0.getMonth() + 1;
  return anniversaryInMonth(
    startDate,
    m > 11 ? t0.getFullYear() + 1 : t0.getFullYear(),
    m > 11 ? 0 : m
  );
}

/**
 * Iterasi semua periode dari startDate sampai hari ini (inklusif periode
 * berikutnya yang upcoming). Tiap periode dilabeli (month, year) sesuai
 * tanggal jatuh tempo di bulan itu.
 */
export function listBillingPeriods(
  startDate: Date,
  today: Date = new Date()
): { month: number; year: number; dueDate: Date }[] {
  const t0 = startOfDay(today);
  const list: { month: number; year: number; dueDate: Date }[] = [];
  let year = startDate.getFullYear();
  let monthIdx = startDate.getMonth();
  // Termasuk satu periode setelah hari ini (upcoming).
  const limitMonths = (t0.getFullYear() - year) * 12 + (t0.getMonth() - monthIdx) + 1;
  for (let i = 0; i <= limitMonths; i++) {
    const due = anniversaryInMonth(startDate, year, monthIdx);
    list.push({ month: monthIdx + 1, year, dueDate: due });
    monthIdx++;
    if (monthIdx > 11) {
      monthIdx = 0;
      year++;
    }
    if (list.length > 240) break; // safety
  }
  return list;
}

export type BillingSnapshot = {
  startDate: Date;
  anniversaryDay: number;
  /** Status periode aktif (yang due-nya paling baru ≤ hari ini) */
  current: {
    month: number;
    year: number;
    dueDate: Date;
    isLate: boolean;
    daysLate: number;
  } | null;
  /** Periode jatuh tempo berikutnya (setelah hari ini) */
  next: {
    month: number;
    year: number;
    dueDate: Date;
    daysUntil: number;
  };
};

export function billingSnapshot(
  startDate: Date,
  today: Date = new Date()
): BillingSnapshot {
  const t0 = startOfDay(today);
  const thisAnn = anniversaryInMonth(startDate, t0.getFullYear(), t0.getMonth());

  let current: BillingSnapshot["current"] = null;
  if (t0.getTime() >= thisAnn.getTime() && thisAnn.getTime() >= startOfDay(startDate).getTime()) {
    const daysLate = Math.floor((t0.getTime() - thisAnn.getTime()) / DAY_MS);
    current = {
      month: thisAnn.getMonth() + 1,
      year: thisAnn.getFullYear(),
      dueDate: thisAnn,
      isLate: daysLate > 0,
      daysLate,
    };
  } else {
    // Hari ini < anniversary bulan ini -> periode "current" sebenarnya
    // belum mulai. Tetapi kalau startDate ada di bulan lalu, kita anggap
    // periode lalu (bulan kemarin) yang relevan.
    const m = t0.getMonth() - 1;
    const prevYear = m < 0 ? t0.getFullYear() - 1 : t0.getFullYear();
    const prevMonth = m < 0 ? 11 : m;
    const prevAnn = anniversaryInMonth(startDate, prevYear, prevMonth);
    if (prevAnn.getTime() >= startOfDay(startDate).getTime()) {
      const daysLate = Math.floor((t0.getTime() - prevAnn.getTime()) / DAY_MS);
      current = {
        month: prevAnn.getMonth() + 1,
        year: prevAnn.getFullYear(),
        dueDate: prevAnn,
        isLate: daysLate > 0,
        daysLate,
      };
    }
  }

  // Next: anniversary terdekat SETELAH hari ini (exclusive).
  let nextDue: Date;
  if (t0.getTime() < thisAnn.getTime()) {
    nextDue = thisAnn;
  } else {
    const m = t0.getMonth() + 1;
    nextDue = anniversaryInMonth(
      startDate,
      m > 11 ? t0.getFullYear() + 1 : t0.getFullYear(),
      m > 11 ? 0 : m
    );
  }
  const daysUntil = Math.ceil((nextDue.getTime() - t0.getTime()) / DAY_MS);

  return {
    startDate,
    anniversaryDay: startDate.getDate(),
    current,
    next: {
      month: nextDue.getMonth() + 1,
      year: nextDue.getFullYear(),
      dueDate: nextDue,
      daysUntil,
    },
  };
}

export function formatDateID(d: Date) {
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
