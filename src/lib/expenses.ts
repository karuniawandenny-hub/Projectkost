import { prisma } from "./prisma";
import { periodsInRange, type ReportFilters, type PeriodKey } from "./reports";

export const ExpenseCategory = {
  UTILITY: "UTILITY",
  STAFF: "STAFF",
  MAINTENANCE: "MAINTENANCE",
  SUPPLIES: "SUPPLIES",
  TAX: "TAX",
  OTHER: "OTHER",
} as const;
export type ExpenseCategory =
  (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  UTILITY: "Utilitas (PLN, air, internet)",
  STAFF: "Gaji & penjaga",
  MAINTENANCE: "Perbaikan & perawatan",
  SUPPLIES: "Perlengkapan",
  TAX: "Pajak & retribusi",
  OTHER: "Lain-lain",
};

export const EXPENSE_CATEGORY_SHORT: Record<ExpenseCategory, string> = {
  UTILITY: "Utilitas",
  STAFF: "Gaji",
  MAINTENANCE: "Perbaikan",
  SUPPLIES: "Perlengkapan",
  TAX: "Pajak",
  OTHER: "Lain-lain",
};

export function isExpenseCategory(s: string): s is ExpenseCategory {
  return s in EXPENSE_CATEGORY_LABEL;
}

export type ExpenseRow = {
  id: string;
  kosId: string;
  kosName: string;
  category: ExpenseCategory;
  date: Date;
  amount: number;
  note: string | null;
  attachmentUrl: string | null;
  createdByName: string;
  createdAt: Date;
};

/**
 * Daftar pengeluaran milik pemilik (semua kos miliknya), bisa difilter.
 * Tidak paginasi — volume per pemilik biasanya kecil (puluhan/bulan).
 */
export async function listExpenses(
  ownerId: string,
  opts: {
    kosId?: string;
    category?: ExpenseCategory;
    from?: Date;
    to?: Date;
  } = {}
): Promise<ExpenseRow[]> {
  const rows = await prisma.expense.findMany({
    where: {
      kos: {
        ownerId,
        ...(opts.kosId ? { id: opts.kosId } : {}),
      },
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.from || opts.to
        ? {
            date: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    include: {
      kos: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kosId: r.kosId,
    kosName: r.kos.name,
    category: r.category as ExpenseCategory,
    date: r.date,
    amount: r.amount,
    note: r.note,
    attachmentUrl: r.attachmentUrl,
    createdByName: r.createdBy.name,
    createdAt: r.createdAt,
  }));
}

export type ProfitLossBreakdown = {
  kosId: string;
  kosName: string;
  income: number; // dari Payment VERIFIED dalam periode
  expense: number; // dari Expense dalam periode
  profit: number; // income - expense
  margin: number; // profit / income * 100, 0 kalau income = 0
  byCategory: Record<ExpenseCategory, number>;
};

export type ProfitLossSummary = {
  rows: ProfitLossBreakdown[];
  totals: {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    byCategory: Record<ExpenseCategory, number>;
  };
};

function emptyCategoryMap(): Record<ExpenseCategory, number> {
  return {
    UTILITY: 0,
    STAFF: 0,
    MAINTENANCE: 0,
    SUPPLIES: 0,
    TAX: 0,
    OTHER: 0,
  };
}

/**
 * Hitung P&L per kos dalam rentang periode yang sama dengan laporan
 * pemasukan. Pemasukan dihitung dari Payment VERIFIED (uang yang
 * benar-benar masuk), bukan ekspektasi tagihan — agar tidak menipu diri
 * sendiri saat banyak penghuni nunggak.
 */
export async function buildProfitLoss(
  ownerId: string,
  filters: ReportFilters
): Promise<ProfitLossSummary> {
  const periods = periodsInRange(filters);
  if (periods.length === 0) {
    return {
      rows: [],
      totals: {
        income: 0,
        expense: 0,
        profit: 0,
        margin: 0,
        byCategory: emptyCategoryMap(),
      },
    };
  }
  const firstStart = monthStart(periods[0]);
  const lastEnd = monthEnd(periods[periods.length - 1]);

  // Pemasukan: payment VERIFIED dengan periodMonth/Year masuk rentang.
  // Pakai OR list periode (bisa multi-bulan, tidak kontinu kalau ada
  // wrap year — meski periodsInRange sudah kontinu, tetap aman).
  const payments = await prisma.payment.findMany({
    where: {
      status: "VERIFIED",
      OR: periods.map((p) => ({
        periodMonth: p.month,
        periodYear: p.year,
      })),
      tenancy: {
        room: {
          kos: {
            ownerId,
            ...(filters.kosId !== "all" ? { id: filters.kosId } : {}),
          },
        },
      },
    },
    select: {
      amount: true,
      tenancy: {
        select: {
          room: {
            select: {
              kos: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  // Pengeluaran: berdasarkan `date` field, bukan periode (karena tagihan
  // listrik bisa dibayar di awal/akhir bulan dengan tanggal aktual).
  const expenses = await prisma.expense.findMany({
    where: {
      date: { gte: firstStart, lte: lastEnd },
      kos: {
        ownerId,
        ...(filters.kosId !== "all" ? { id: filters.kosId } : {}),
      },
    },
    select: {
      amount: true,
      category: true,
      kosId: true,
      kos: { select: { name: true } },
    },
  });

  const byKos = new Map<string, ProfitLossBreakdown>();
  function bucket(kosId: string, kosName: string): ProfitLossBreakdown {
    let b = byKos.get(kosId);
    if (!b) {
      b = {
        kosId,
        kosName,
        income: 0,
        expense: 0,
        profit: 0,
        margin: 0,
        byCategory: emptyCategoryMap(),
      };
      byKos.set(kosId, b);
    }
    return b;
  }

  for (const p of payments) {
    const k = p.tenancy.room.kos;
    bucket(k.id, k.name).income += p.amount;
  }
  for (const e of expenses) {
    const b = bucket(e.kosId, e.kos.name);
    b.expense += e.amount;
    const cat = isExpenseCategory(e.category) ? e.category : "OTHER";
    b.byCategory[cat] += e.amount;
  }

  const rows = [...byKos.values()];
  for (const r of rows) {
    r.profit = r.income - r.expense;
    r.margin = r.income > 0 ? (r.profit / r.income) * 100 : 0;
  }
  rows.sort((a, b) => b.profit - a.profit);

  const totals = {
    income: rows.reduce((s, r) => s + r.income, 0),
    expense: rows.reduce((s, r) => s + r.expense, 0),
    profit: 0,
    margin: 0,
    byCategory: emptyCategoryMap(),
  };
  totals.profit = totals.income - totals.expense;
  totals.margin = totals.income > 0 ? (totals.profit / totals.income) * 100 : 0;
  for (const r of rows) {
    for (const k of Object.keys(totals.byCategory) as ExpenseCategory[]) {
      totals.byCategory[k] += r.byCategory[k];
    }
  }

  return { rows, totals };
}

function monthStart(p: PeriodKey) {
  return new Date(p.year, p.month - 1, 1, 0, 0, 0, 0);
}
function monthEnd(p: PeriodKey) {
  return new Date(p.year, p.month, 0, 23, 59, 59, 999);
}
