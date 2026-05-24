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
import { PrintButton } from "./PrintButton";

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
  const { rows, summary } = await buildReport(user.id, filters);

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
          <PrintButton />
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
