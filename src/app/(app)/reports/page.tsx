import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  buildReport,
  MONTH_LABELS,
  rupiah,
  type ReportFilters,
} from "@/lib/reports";
import { ReportFiltersForm } from "./ReportFiltersForm";
import { PrintButton } from "@/components/PrintButton";
import {
  buildProfitLoss,
  EXPENSE_CATEGORY_SHORT,
  type ExpenseCategory,
} from "@/lib/expenses";
import Link from "next/link";

const STATUSES = ["all", "VERIFIED", "PENDING", "REJECTED", "UNPAID"] as const;

function parseFilters(sp: Record<string, string | undefined>): ReportFilters {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const mode = sp.mode === "range" ? "range" : "single";
  const month = clamp(parseInt(sp.month ?? "", 10) || currentMonth, 1, 12);
  const year = clamp(parseInt(sp.year ?? "", 10) || currentYear, 2020, 2100);
  const fromMonth = clamp(parseInt(sp.fromMonth ?? "", 10) || currentMonth, 1, 12);
  const fromYear = clamp(parseInt(sp.fromYear ?? "", 10) || currentYear, 2020, 2100);
  const toMonth = clamp(parseInt(sp.toMonth ?? "", 10) || currentMonth, 1, 12);
  const toYear = clamp(parseInt(sp.toYear ?? "", 10) || currentYear, 2020, 2100);

  const kosId = sp.kosId && sp.kosId !== "all" ? sp.kosId : "all";
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ReportFilters["status"])
    : "all";

  return {
    mode,
    month,
    year,
    fromMonth,
    fromYear,
    toMonth,
    toYear,
    kosId,
    status,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function StatusBadge({ s }: { s: string }) {
  if (s === "VERIFIED") return <span className="badge-green">Lunas</span>;
  if (s === "PENDING") return <span className="badge-yellow">Menunggu</span>;
  if (s === "REJECTED") return <span className="badge-red">Ditolak</span>;
  return <span className="badge-slate">Belum bayar</span>;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/dashboard");

  const filters = parseFilters(searchParams);
  const kosList = await prisma.kos.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const [{ rows, summary }, pnl] = await Promise.all([
    buildReport(user.id, filters),
    buildProfitLoss(user.id, filters),
  ]);

  const periodLabel =
    filters.mode === "single"
      ? `${MONTH_LABELS[filters.month - 1]} ${filters.year}`
      : `${MONTH_LABELS[filters.fromMonth - 1]} ${filters.fromYear} — ${MONTH_LABELS[filters.toMonth - 1]} ${filters.toYear}`;

  const kosLabel =
    filters.kosId === "all"
      ? "Semua kos"
      : kosList.find((k) => k.id === filters.kosId)?.name ?? "Semua kos";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Laporan</h1>
          <p className="text-slate-600">
            Rekapitulasi data kos & status pembayaran.
          </p>
        </div>
        <div className="no-print">
          <PrintButton label="Cetak / Simpan PDF" className="btn-primary" />
        </div>
      </div>

      <div className="no-print">
        <ReportFiltersForm initial={filters} kosOptions={kosList} />
      </div>

      {/* Header laporan saat di-print */}
      <div className="hidden print:block">
        <h2 className="text-xl font-bold">Laporan Kos — Kos Baiti</h2>
        <div className="text-sm">
          Periode: <strong>{periodLabel}</strong> · Kos:{" "}
          <strong>{kosLabel}</strong>
          {filters.status !== "all" && (
            <>
              {" "}
              · Status: <strong>{filters.status}</strong>
            </>
          )}
        </div>
        <div className="text-xs text-slate-500">
          Dicetak pada: {new Date().toLocaleString("id-ID")}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kos terlibat" value={summary.uniqueKos} />
        <Stat
          label="Total baris tagihan"
          value={`${summary.occupiedSlots}`}
          sub={`${summary.periodsCount} bulan`}
        />
        <Stat
          label="Total tagihan (ekspektasi)"
          value={rupiah(summary.expectedRevenue)}
        />
        <Stat
          label="Sudah masuk (lunas)"
          value={rupiah(summary.verifiedAmount)}
          tone="green"
        />
        <Stat
          label="Lunas"
          value={`${summary.countVerified}`}
          sub="pembayaran"
          tone="green"
        />
        <Stat
          label="Menunggu verifikasi"
          value={`${summary.countPending}`}
          sub={rupiah(summary.pendingAmount)}
          tone="yellow"
        />
        <Stat
          label="Ditolak"
          value={`${summary.countRejected}`}
          sub={rupiah(summary.rejectedAmount)}
          tone="red"
        />
        <Stat
          label="Belum bayar"
          value={`${summary.countUnpaid}`}
          sub={rupiah(summary.unpaidAmount)}
          tone="slate"
        />
      </div>

      {/* Ringkasan keuangan per kos (J - P&L sederhana) */}
      <FinancialBreakdown rows={rows} />

      {/* Laba bersih (gabungan: pemasukan VERIFIED − pengeluaran) */}
      <ProfitLossSection pnl={pnl} />

      {/* Detail table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2">Periode</th>
              <th className="px-3 py-2">Kos</th>
              <th className="px-3 py-2">Kamar</th>
              <th className="px-3 py-2">Penghuni</th>
              <th className="px-3 py-2 text-right">Harga / bulan</th>
              <th className="px-3 py-2 text-right">Nominal bayar</th>
              <th className="px-3 py-2">Tgl upload</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Tidak ada data yang cocok dengan filter.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  {MONTH_LABELS[r.periodMonth - 1].slice(0, 3)} {r.periodYear}
                </td>
                <td className="px-3 py-2">{r.kosName}</td>
                <td className="px-3 py-2">Kamar {r.roomName}</td>
                <td className="px-3 py-2">
                  <div>{r.tenantName}</div>
                  <div className="text-xs text-slate-500">{r.tenantEmail}</div>
                </td>
                <td className="px-3 py-2 text-right">{rupiah(r.monthlyPrice)}</td>
                <td className="px-3 py-2 text-right">
                  {r.paymentAmount !== null ? rupiah(r.paymentAmount) : "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.paymentDate
                    ? new Date(r.paymentDate).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge s={r.paymentStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 no-print">
        Tip: tekan <kbd className="rounded border px-1">Cmd</kbd>+
        <kbd className="rounded border px-1">P</kbd> (atau Ctrl+P) atau klik
        tombol &quot;Cetak / Simpan PDF&quot; untuk menyimpan laporan ini sebagai
        PDF.
      </p>
    </div>
  );
}

/**
 * Bagian Laba & Rugi: gabungkan pemasukan VERIFIED + pengeluaran per kos
 * dalam periode laporan. Pemilik bisa lihat laba bersih nyata, bukan
 * sekadar tagihan masuk.
 */
function ProfitLossSection({
  pnl,
}: {
  pnl: import("@/lib/expenses").ProfitLossSummary;
}) {
  const { rows, totals } = pnl;
  const hasAnything = rows.length > 0 && (totals.income > 0 || totals.expense > 0);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-700">
          Laba & Rugi (P&amp;L)
        </h2>
        <p className="text-xs text-slate-500">
          Pemasukan diakui dari pembayaran <strong>terverifikasi</strong>;
          pengeluaran dari{" "}
          <Link
            href="/expenses"
            className="text-brand-700 hover:underline no-print"
          >
            halaman Pengeluaran
          </Link>
          <span className="hidden print:inline">halaman Pengeluaran</span>.
        </p>
      </div>

      {!hasAnything ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">
          Belum ada pemasukan & pengeluaran pada periode ini. Catat pengeluaran
          di <Link href="/expenses" className="text-brand-700 hover:underline no-print">/expenses</Link>{" "}
          <span className="hidden print:inline">halaman Pengeluaran</span>
          agar laba bersih bisa dihitung.
        </div>
      ) : (
        <>
          {/* Total cards */}
          <div className="grid gap-3 p-4 sm:grid-cols-4">
            <Stat label="Pemasukan" value={rupiah(totals.income)} tone="green" />
            <Stat
              label="Pengeluaran"
              value={rupiah(totals.expense)}
              tone="red"
            />
            <Stat
              label="Laba bersih"
              value={rupiah(totals.profit)}
              tone={totals.profit >= 0 ? "green" : "red"}
            />
            <Stat
              label="Margin"
              value={`${totals.margin.toFixed(1)}%`}
              tone={totals.margin >= 30 ? "green" : totals.margin >= 0 ? "yellow" : "red"}
            />
          </div>

          {/* Per kos */}
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2">Kos</th>
                  <th className="px-3 py-2 text-right">Pemasukan</th>
                  <th className="px-3 py-2 text-right">Pengeluaran</th>
                  <th className="px-3 py-2 text-right">Laba</th>
                  <th className="px-3 py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.kosId} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.kosName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {rupiah(r.income)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">
                      {rupiah(r.expense)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        r.profit >= 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {rupiah(r.profit)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        r.margin >= 30
                          ? "text-emerald-700"
                          : r.margin >= 0
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}
                    >
                      {r.margin.toFixed(0)}%
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {rupiah(totals.income)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">
                    {rupiah(totals.expense)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      totals.profit >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {rupiah(totals.profit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totals.margin.toFixed(0)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Breakdown per kategori (kalau ada pengeluaran) */}
          {totals.expense > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                Pengeluaran per kategori
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(totals.byCategory) as ExpenseCategory[])
                  .filter((c) => totals.byCategory[c] > 0)
                  .sort((a, b) => totals.byCategory[b] - totals.byCategory[a])
                  .map((c) => {
                    const v = totals.byCategory[c];
                    const pct = totals.expense > 0 ? (v / totals.expense) * 100 : 0;
                    return (
                      <div
                        key={c}
                        className="rounded-md border border-slate-200 px-3 py-2"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-xs text-slate-600">
                            {EXPENSE_CATEGORY_SHORT[c]}
                          </div>
                          <div className="text-xs text-slate-500">
                            {pct.toFixed(0)}%
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          {rupiah(v)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "green" | "yellow" | "red" | "slate";
}) {
  const toneCls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50/40"
      : tone === "yellow"
        ? "border-amber-200 bg-amber-50/40"
        : tone === "red"
          ? "border-red-200 bg-red-50/40"
          : tone === "slate"
            ? "border-slate-200 bg-slate-50/40"
            : "";
  return (
    <div className={`card ${toneCls}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Breakdown keuangan per kos: pendapatan, ekspektasi, collection rate.
 * Disagregasi dari rows yang sudah ada (tidak query DB lagi).
 */
function FinancialBreakdown({
  rows,
}: {
  rows: import("@/lib/reports").ReportRow[];
}) {
  if (rows.length === 0) return null;

  type KosAgg = {
    kosName: string;
    expected: number;
    verified: number;
    pending: number;
    unpaid: number;
  };
  const byKos = new Map<string, KosAgg>();
  let totalExpected = 0;
  let totalVerified = 0;
  let totalPending = 0;
  let totalUnpaid = 0;

  // Single pass: bangun per-kos aggregation DAN total grand secara
  // bersamaan. Sebelumnya 4 reduce terpisah setelah grouping = O(n*5).
  for (const r of rows) {
    const k = byKos.get(r.kosId) ?? {
      kosName: r.kosName,
      expected: 0,
      verified: 0,
      pending: 0,
      unpaid: 0,
    };
    k.expected += r.monthlyPrice;
    totalExpected += r.monthlyPrice;
    if (r.paymentStatus === "VERIFIED") {
      const amt = r.paymentAmount ?? 0;
      k.verified += amt;
      totalVerified += amt;
    } else if (r.paymentStatus === "PENDING") {
      const amt = r.paymentAmount ?? 0;
      k.pending += amt;
      totalPending += amt;
    } else if (r.paymentStatus === "UNPAID") {
      k.unpaid += r.monthlyPrice;
      totalUnpaid += r.monthlyPrice;
    }
    byKos.set(r.kosId, k);
  }

  const list = [...byKos.values()].sort((a, b) => b.verified - a.verified);
  const collectionRate =
    totalExpected > 0 ? (totalVerified / totalExpected) * 100 : 0;

  function rateClass(rate: number) {
    return rate >= 85
      ? "text-emerald-700"
      : rate >= 60
        ? "text-amber-700"
        : "text-red-700";
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-700">
          Ringkasan Keuangan per Kos
        </h2>
        <p className="text-xs text-slate-500">
          Collection rate keseluruhan:{" "}
          <strong className={rateClass(collectionRate)}>
            {collectionRate.toFixed(1)}%
          </strong>{" "}
          ({rupiah(totalVerified)} dari {rupiah(totalExpected)})
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2">Kos</th>
              <th className="px-3 py-2 text-right">Ekspektasi</th>
              <th className="px-3 py-2 text-right">Lunas</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-right">Belum bayar</th>
              <th className="px-3 py-2 text-right">Collection</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((k, i) => {
              const rate =
                k.expected > 0 ? (k.verified / k.expected) * 100 : 0;
              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{k.kosName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {rupiah(k.expected)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold">
                    {rupiah(k.verified)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                    {rupiah(k.pending)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {rupiah(k.unpaid)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${rateClass(rate)}`}
                  >
                    {rate.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2">TOTAL</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {rupiah(totalExpected)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                {rupiah(totalVerified)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {rupiah(totalPending)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {rupiah(totalUnpaid)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${rateClass(collectionRate)}`}
              >
                {collectionRate.toFixed(0)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
