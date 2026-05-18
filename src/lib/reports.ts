import { prisma } from "./prisma";

export type ReportFilters = {
  mode: "single" | "range";
  month: number;       // 1-12, untuk mode single
  year: number;
  fromMonth: number;   // 1-12, untuk mode range
  fromYear: number;
  toMonth: number;
  toYear: number;
  kosId: string | "all";
  status: "all" | "VERIFIED" | "PENDING" | "REJECTED" | "UNPAID";
};

export type PeriodKey = { month: number; year: number };

export type ReportRow = {
  kosId: string;
  kosName: string;
  roomId: string;
  roomName: string;
  monthlyPrice: number;
  tenancyId: string;
  tenancyStartDate: Date;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  periodMonth: number;
  periodYear: number;
  paymentStatus: "VERIFIED" | "PENDING" | "REJECTED" | "UNPAID";
  paymentAmount: number | null;
  paymentDate: Date | null;
};

export type ReportSummary = {
  periodsCount: number;
  uniqueKos: number;
  occupiedSlots: number;
  expectedRevenue: number;
  verifiedAmount: number;
  pendingAmount: number;
  rejectedAmount: number;
  unpaidAmount: number;
  countVerified: number;
  countPending: number;
  countRejected: number;
  countUnpaid: number;
};

export const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function startOfMonth(month: number, year: number) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}
function endOfMonth(month: number, year: number) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

export function periodsInRange(f: ReportFilters): PeriodKey[] {
  if (f.mode === "single") return [{ month: f.month, year: f.year }];
  const list: PeriodKey[] = [];
  let y = f.fromYear;
  let m = f.fromMonth;
  // Guard: kalau "to" lebih awal dari "from", kembalikan list 1 bulan.
  if (f.toYear < f.fromYear || (f.toYear === f.fromYear && f.toMonth < f.fromMonth)) {
    return [{ month: f.fromMonth, year: f.fromYear }];
  }
  while (y < f.toYear || (y === f.toYear && m <= f.toMonth)) {
    list.push({ month: m, year: y });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    // Safety: jangan lebih dari 60 bulan
    if (list.length >= 60) break;
  }
  return list;
}

export async function buildReport(
  ownerId: string,
  filters: ReportFilters
): Promise<{ rows: ReportRow[]; summary: ReportSummary }> {
  const periods = periodsInRange(filters);
  if (periods.length === 0) {
    return {
      rows: [],
      summary: emptySummary(),
    };
  }

  const firstStart = startOfMonth(periods[0].month, periods[0].year);
  const lastEnd = endOfMonth(
    periods[periods.length - 1].month,
    periods[periods.length - 1].year
  );

  // Ambil seluruh tenancy milik kos owner yang overlap dengan rentang.
  const tenancies = await prisma.tenancy.findMany({
    where: {
      room: {
        kos: {
          ownerId,
          ...(filters.kosId !== "all" ? { id: filters.kosId } : {}),
        },
      },
      startDate: { lte: lastEnd },
      OR: [
        { endDate: null },
        { endDate: { gte: firstStart } },
      ],
    },
    include: {
      tenant: { select: { id: true, name: true, email: true } },
      room: { include: { kos: { select: { id: true, name: true } } } },
      payments: {
        where: {
          OR: periods.map((p) => ({
            periodMonth: p.month,
            periodYear: p.year,
          })),
        },
      },
    },
  });

  const rows: ReportRow[] = [];

  for (const t of tenancies) {
    for (const p of periods) {
      // Periode aktif untuk tenancy ini?
      const ps = startOfMonth(p.month, p.year);
      const pe = endOfMonth(p.month, p.year);
      const overlap =
        t.startDate <= pe && (t.endDate === null || t.endDate >= ps);
      if (!overlap) continue;

      const pay = t.payments.find(
        (x) => x.periodMonth === p.month && x.periodYear === p.year
      );
      const status: ReportRow["paymentStatus"] = pay
        ? (pay.status as "VERIFIED" | "PENDING" | "REJECTED")
        : "UNPAID";

      rows.push({
        kosId: t.room.kos.id,
        kosName: t.room.kos.name,
        roomId: t.room.id,
        roomName: t.room.name,
        monthlyPrice: t.room.monthlyPrice,
        tenancyId: t.id,
        tenancyStartDate: t.startDate,
        tenantId: t.tenant.id,
        tenantName: t.tenant.name,
        tenantEmail: t.tenant.email,
        periodMonth: p.month,
        periodYear: p.year,
        paymentStatus: status,
        paymentAmount: pay?.amount ?? null,
        paymentDate: pay?.createdAt ?? null,
      });
    }
  }

  // Dedup per (tenantId, periode): kalau seorang penghuni punya >1 tenancy
  // yang overlap dengan periode yang sama (contoh: pindah kamar di tengah
  // bulan), pilih SATU baris saja. Prioritas:
  //   1. baris dengan payment paling "kuat" (VERIFIED > PENDING > REJECTED > UNPAID)
  //   2. tie-breaker: tenancy paling baru (startDate terbesar) — anggap
  //      itu kamar tempat penghuni sekarang berada.
  const statusRank: Record<ReportRow["paymentStatus"], number> = {
    VERIFIED: 4,
    PENDING: 3,
    REJECTED: 2,
    UNPAID: 1,
  };
  const deduped = new Map<string, ReportRow>();
  for (const r of rows) {
    const key = `${r.tenantId}|${r.periodYear}|${r.periodMonth}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, r);
      continue;
    }
    const a = statusRank[r.paymentStatus];
    const b = statusRank[existing.paymentStatus];
    if (a > b) {
      deduped.set(key, r);
    } else if (a === b) {
      // Tie: pilih tenancy yang lebih baru
      if (r.tenancyStartDate.getTime() > existing.tenancyStartDate.getTime()) {
        deduped.set(key, r);
      }
    }
  }
  const dedupedRows = Array.from(deduped.values());

  // Sort: kos asc, kamar asc, periode asc (tahun lalu bulan)
  dedupedRows.sort((a, b) => {
    if (a.kosName !== b.kosName) return a.kosName.localeCompare(b.kosName);
    if (a.roomName !== b.roomName) return a.roomName.localeCompare(b.roomName);
    if (a.periodYear !== b.periodYear) return a.periodYear - b.periodYear;
    return a.periodMonth - b.periodMonth;
  });

  // Hitung summary dari rows yang sudah deduped.
  const summary = summarize(dedupedRows, periods.length);

  // Filter status untuk tampilan tabel.
  const filtered =
    filters.status === "all"
      ? dedupedRows
      : dedupedRows.filter((r) => r.paymentStatus === filters.status);

  return { rows: filtered, summary };
}

function emptySummary(): ReportSummary {
  return {
    periodsCount: 0,
    uniqueKos: 0,
    occupiedSlots: 0,
    expectedRevenue: 0,
    verifiedAmount: 0,
    pendingAmount: 0,
    rejectedAmount: 0,
    unpaidAmount: 0,
    countVerified: 0,
    countPending: 0,
    countRejected: 0,
    countUnpaid: 0,
  };
}

function summarize(rows: ReportRow[], periodsCount: number): ReportSummary {
  const s = emptySummary();
  s.periodsCount = periodsCount;
  const kos = new Set<string>();
  for (const r of rows) {
    kos.add(r.kosId);
    s.expectedRevenue += r.monthlyPrice;
    if (r.paymentStatus === "VERIFIED") {
      s.countVerified++;
      s.verifiedAmount += r.paymentAmount ?? r.monthlyPrice;
    } else if (r.paymentStatus === "PENDING") {
      s.countPending++;
      s.pendingAmount += r.paymentAmount ?? r.monthlyPrice;
    } else if (r.paymentStatus === "REJECTED") {
      s.countRejected++;
      s.rejectedAmount += r.paymentAmount ?? 0;
    } else if (r.paymentStatus === "UNPAID") {
      s.countUnpaid++;
      s.unpaidAmount += r.monthlyPrice;
    }
  }
  s.uniqueKos = kos.size;
  s.occupiedSlots = rows.length;
  return s;
}

export function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
