"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { viewerUrl } from "@/lib/viewer";
import { OverdueBadge } from "@/components/OverdueBadge";
import { computeOverdue } from "@/lib/overdue";
import { verifyPayment, verifyPaymentManual } from "./actions";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function rupiahShort(n: number) {
  if (n >= 1_000_000) {
    const jt = n / 1_000_000;
    return "Rp " + (Number.isInteger(jt) ? jt.toString() : jt.toFixed(1)) + "jt";
  }
  if (n >= 1_000) return "Rp " + Math.round(n / 1000) + "rb";
  return "Rp " + n;
}

export type PaymentItem = {
  id: string;
  status: "DUE" | "PENDING" | "VERIFIED" | "REJECTED";
  periodMonth: number;
  periodYear: number;
  amount: number;
  proofUrl: string | null;
  note: string | null;
  reviewNote: string | null;
  tenantName: string;
  kosId: string;
  kosName: string;
  roomName: string;
  reviewedAt: string | null;
  dueDate: string | null;
};

// ---------- Sorting ----------
type SortKey = "nama" | "amount" | "overdue" | "reviewedAt" | "periode";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

function overdueDays(p: PaymentItem): number {
  if (!p.dueDate) return -1;
  const info = computeOverdue(p.dueDate, p.status);
  return info?.daysOverdue ?? -1;
}
function periodNum(p: PaymentItem): number {
  return p.periodYear * 12 + p.periodMonth;
}

function sortItems(items: PaymentItem[], s: SortState): PaymentItem[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (s.key) {
      case "nama":
        cmp = a.tenantName.localeCompare(b.tenantName);
        break;
      case "amount":
        cmp = a.amount - b.amount;
        break;
      case "overdue":
        cmp = overdueDays(a) - overdueDays(b);
        break;
      case "reviewedAt": {
        const av = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0;
        const bv = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0;
        cmp = av - bv;
        break;
      }
      case "periode":
        cmp = periodNum(a) - periodNum(b);
        break;
    }
    if (cmp !== 0) return cmp * sign;
    // Tie-breaker: nama asc supaya stabil.
    return a.tenantName.localeCompare(b.tenantName);
  });
}

export function OwnerPaymentsView({
  pending,
  due,
  history,
  period,
  historyCountsByPeriod,
}: {
  pending: PaymentItem[];
  due: PaymentItem[];
  history: PaymentItem[];
  period: { month: number; year: number };
  historyCountsByPeriod: { month: number; year: number; count: number }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [kosFilter, setKosFilter] = useState<string>("all");

  // Sort state per section — default berbeda:
  // - Menunggu: nama asc (biar reviewer verify berurutan)
  // - Tagihan terbuka: overdue desc (terlama telat di paling atas)
  // - Riwayat: reviewedAt desc (verifikasi terbaru dulu)
  const [pendingSort, setPendingSort] = useState<SortState>({
    key: "nama",
    dir: "asc",
  });
  const [dueSort, setDueSort] = useState<SortState>({
    key: "overdue",
    dir: "desc",
  });
  const [historySort, setHistorySort] = useState<SortState>({
    key: "reviewedAt",
    dir: "desc",
  });

  const applyFilters = (p: PaymentItem): boolean => {
    if (kosFilter !== "all" && p.kosId !== kosFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.tenantName.toLowerCase().includes(q) ||
      p.roomName.toLowerCase().includes(q) ||
      p.kosName.toLowerCase().includes(q)
    );
  };

  const pendingFiltered = useMemo(
    () => sortItems(pending.filter(applyFilters), pendingSort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, search, kosFilter, pendingSort]
  );
  const dueFiltered = useMemo(
    () => sortItems(due.filter(applyFilters), dueSort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [due, search, kosFilter, dueSort]
  );
  const historyFiltered = useMemo(
    () => sortItems(history.filter(applyFilters), historySort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, search, kosFilter, historySort]
  );

  const stats = useMemo(() => {
    const dueAmount = due.reduce((s, p) => s + p.amount, 0);
    const pendingAmount = pending.reduce((s, p) => s + p.amount, 0);
    const verifiedAmount = history
      .filter((p) => p.status === "VERIFIED")
      .reduce((s, p) => s + p.amount, 0);
    const criticalOverdue = [...due, ...history.filter((p) => p.status === "REJECTED")]
      .map((p) => computeOverdue(p.dueDate ?? "", p.status))
      .filter((info): info is NonNullable<typeof info> => !!info && info.level === "critical").length;
    return {
      pendingCount: pending.length,
      pendingAmount,
      dueCount: due.length,
      dueAmount,
      historyCount: history.length,
      verifiedAmount,
      criticalOverdue,
    };
  }, [pending, due, history]);

  // Kos options utk dropdown filter — union semua kos dari 3 dataset.
  const kosOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of [...pending, ...due, ...history]) {
      map.set(p.kosId, p.kosName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pending, due, history]);

  function changePeriod(month: number, year: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(month));
    params.set("year", String(year));
    router.push(`/payments?${params.toString()}`);
  }

  const periodLabel = `${MONTHS[period.month - 1]} ${period.year}`;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama penghuni, kamar, atau kos…"
              className="input h-10 w-full pl-9 text-[16px]"
              autoComplete="off"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔍
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {kosOptions.length > 1 && (
              <>
                <label className="text-xs font-medium text-slate-600">
                  Kos:
                </label>
                <select
                  value={kosFilter}
                  onChange={(e) => setKosFilter(e.target.value)}
                  className="input h-10 text-sm"
                >
                  <option value="all">Semua Kos ({kosOptions.length})</option>
                  {kosOptions.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="text-xs font-medium text-slate-600">
              Periode:
            </label>
            <PeriodPicker
              current={period}
              historyCounts={historyCountsByPeriod}
              onChange={changePeriod}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Menunggu verifikasi"
            value={String(stats.pendingCount)}
            sub={
              stats.pendingCount > 0 ? rupiahShort(stats.pendingAmount) : "—"
            }
            tone={stats.pendingCount > 0 ? "amber" : "neutral"}
          />
          <StatTile
            label="Tagihan terbuka"
            value={String(stats.dueCount)}
            sub={stats.dueCount > 0 ? rupiahShort(stats.dueAmount) : "—"}
          />
          <StatTile
            label="Terlambat >7 hari"
            value={String(stats.criticalOverdue)}
            sub={
              stats.criticalOverdue > 0
                ? "Perlu follow-up segera"
                : "Semua on-track"
            }
            tone={stats.criticalOverdue > 0 ? "red" : "neutral"}
          />
          <StatTile
            label={`Terverifikasi (${periodLabel})`}
            value={rupiahShort(stats.verifiedAmount)}
            tone="green"
          />
        </div>
      </div>

      {/* Menunggu verifikasi */}
      <Section
        title="Menunggu verifikasi"
        subtitle={`${pendingFiltered.length} pembayaran ${periodLabel}`}
        count={pendingFiltered.length}
        tone="amber"
      >
        {pending.length === 0 ? (
          <EmptyRow>Tidak ada pembayaran menunggu verifikasi di {periodLabel}.</EmptyRow>
        ) : pendingFiltered.length === 0 ? (
          <EmptyRow>Tidak ada yang cocok dengan pencarian/filter.</EmptyRow>
        ) : (
          <PendingTable
            items={pendingFiltered}
            sort={pendingSort}
            onSort={setPendingSort}
          />
        )}
      </Section>

      {/* Tagihan Terbuka */}
      <Section
        title="Tagihan terbuka — belum diupload"
        subtitle={`${dueFiltered.length} tagihan ${periodLabel}`}
        count={dueFiltered.length}
      >
        {due.length === 0 ? (
          <EmptyRow>Tidak ada tagihan terbuka di {periodLabel}.</EmptyRow>
        ) : dueFiltered.length === 0 ? (
          <EmptyRow>Tidak ada yang cocok dengan pencarian/filter.</EmptyRow>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-500">
              Penghuni belum upload bukti. Kalau Anda menerima pembayaran di
              luar app (cash / transfer manual), bisa tandai lunas via tombol di
              setiap baris.
            </p>
            <DueTable items={dueFiltered} sort={dueSort} onSort={setDueSort} />
          </>
        )}
      </Section>

      {/* Riwayat */}
      <Section
        title="Riwayat"
        subtitle={`${historyFiltered.length} pembayaran ${periodLabel}`}
        count={historyFiltered.length}
      >
        {history.length === 0 ? (
          <EmptyRow>
            Belum ada riwayat verifikasi/tolak di {periodLabel}. Ganti periode
            di toolbar untuk lihat bulan lain.
          </EmptyRow>
        ) : historyFiltered.length === 0 ? (
          <EmptyRow>Tidak ada yang cocok dengan pencarian/filter.</EmptyRow>
        ) : (
          <HistoryTable
            items={historyFiltered}
            sort={historySort}
            onSort={setHistorySort}
          />
        )}
      </Section>
    </div>
  );
}

// =========================
// Table components
// =========================
//
// Pola responsive: desktop (md+) render sebagai <table> dengan header
// sortable. Mobile (<md) render sebagai card compact. Datasetnya sama
// — cuma tampilan yang beda. Dua-duanya di-render tapi disembunyikan
// via Tailwind hidden/block class, sehingga tidak perlu dua kali fetch.

function SortHeader({
  label,
  active,
  dir,
  align = "left",
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onClick: () => void;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <th className={`px-3 py-2 ${alignClass}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
          active ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        {label}
        <span className={active ? "opacity-100" : "opacity-40"}>{arrow}</span>
      </button>
    </th>
  );
}

function toggleSort(
  current: SortState,
  key: SortKey,
  defaultDir: SortDir
): SortState {
  if (current.key !== key) return { key, dir: defaultDir };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

// ---------- Pending ----------

function PendingTable({
  items,
  sort,
  onSort,
}: {
  items: PaymentItem[];
  sort: SortState;
  onSort: (s: SortState) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="w-12 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                No.
              </th>
              <SortHeader
                label="Penghuni"
                active={sort.key === "nama"}
                dir={sort.dir}
                onClick={() => onSort(toggleSort(sort, "nama", "asc"))}
              />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kamar · Kos
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Periode
              </th>
              <SortHeader
                label="Jumlah"
                align="right"
                active={sort.key === "amount"}
                dir={sort.dir}
                onClick={() => onSort(toggleSort(sort, "amount", "desc"))}
              />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bukti
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((p, idx) => {
              const isOpen = expandedId === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {p.tenantName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      Kamar {p.roomName}
                      <span className="ml-1 text-xs text-slate-400">
                        · {p.kosName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {MONTHS[p.periodMonth - 1]} {p.periodYear}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                      {rupiah(p.amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.proofUrl ? (
                        <a
                          href={viewerUrl(p.proofUrl, "Bukti pembayaran")}
                          className="text-sm text-brand-700 hover:underline"
                        >
                          📎 Lihat
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isOpen ? null : p.id)
                        }
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        {isOpen ? "Tutup" : "Verifikasi"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-3 py-3">
                        {p.note && (
                          <div className="mb-2 text-xs text-slate-600">
                            Catatan penghuni: {p.note}
                          </div>
                        )}
                        <PendingActionForm p={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {items.map((p) => (
          <PendingCard key={p.id} p={p} />
        ))}
      </div>
    </>
  );
}

function PendingCard({ p }: { p: PaymentItem }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-800 truncate">
            {p.tenantName}
          </div>
          <div className="text-xs text-slate-500">
            Kamar {p.roomName} · {p.kosName}
          </div>
          <div className="text-xs text-slate-500">
            {MONTHS[p.periodMonth - 1]} {p.periodYear} · {rupiah(p.amount)}
          </div>
          {p.note && (
            <div className="text-xs text-slate-500 mt-0.5">
              Catatan: {p.note}
            </div>
          )}
        </div>
        {p.proofUrl && (
          <a
            href={viewerUrl(p.proofUrl, "Bukti pembayaran")}
            className="shrink-0 text-sm font-medium text-brand-700 hover:underline"
          >
            📎 Bukti
          </a>
        )}
      </div>
      <PendingActionForm p={p} />
    </div>
  );
}

function PendingActionForm({ p }: { p: PaymentItem }) {
  return (
    <form
      action={verifyPayment}
      className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2"
    >
      <input type="hidden" name="paymentId" value={p.id} />
      <div className="flex-1 min-w-[180px]">
        <input
          name="reviewNote"
          className="input h-9 text-sm"
          placeholder="Catatan review (opsional, wajib kalau menolak)"
        />
      </div>
      <button
        name="action"
        value="VERIFY"
        type="submit"
        className="btn-success h-9 px-3 text-sm"
      >
        Setujui
      </button>
      <button
        name="action"
        value="REJECT"
        type="submit"
        className="btn-danger h-9 px-3 text-sm"
      >
        Tolak
      </button>
    </form>
  );
}

// ---------- Due ----------

function DueTable({
  items,
  sort,
  onSort,
}: {
  items: PaymentItem[];
  sort: SortState;
  onSort: (s: SortState) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="w-12 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                No.
              </th>
              <SortHeader
                label="Penghuni"
                active={sort.key === "nama"}
                dir={sort.dir}
                onClick={() => onSort(toggleSort(sort, "nama", "asc"))}
              />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kamar · Kos
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Periode
              </th>
              <SortHeader
                label="Jumlah"
                align="right"
                active={sort.key === "amount"}
                dir={sort.dir}
                onClick={() => onSort(toggleSort(sort, "amount", "desc"))}
              />
              <SortHeader
                label="Telat"
                active={sort.key === "overdue"}
                dir={sort.dir}
                onClick={() => onSort(toggleSort(sort, "overdue", "desc"))}
              />
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((p, idx) => {
              const isOpen = expandedId === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {p.tenantName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      Kamar {p.roomName}
                      <span className="ml-1 text-xs text-slate-400">
                        · {p.kosName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {MONTHS[p.periodMonth - 1]} {p.periodYear}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                      {rupiah(p.amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <OverdueBadge
                        dueDate={p.dueDate}
                        status={p.status}
                        size="xs"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isOpen ? null : p.id)
                        }
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        {isOpen ? "Batal" : "Tandai lunas"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-amber-50">
                      <td colSpan={7} className="px-3 py-3">
                        <DueActionForm p={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {items.map((p) => (
          <DueCard key={p.id} p={p} />
        ))}
      </div>
    </>
  );
}

function DueCard({ p }: { p: PaymentItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-800 truncate">
              {p.tenantName}
            </span>
            <OverdueBadge dueDate={p.dueDate} status={p.status} size="xs" />
          </div>
          <div className="text-xs text-slate-500">
            Kamar {p.roomName} · {p.kosName}
          </div>
          <div className="text-xs text-slate-500">
            {MONTHS[p.periodMonth - 1]} {p.periodYear} · {rupiah(p.amount)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-sm font-medium text-brand-700 hover:underline"
        >
          {open ? "Batal" : "Tandai lunas"}
        </button>
      </div>
      {open && (
        <div className="mt-2">
          <DueActionForm p={p} />
        </div>
      )}
    </div>
  );
}

function DueActionForm({ p }: { p: PaymentItem }) {
  return (
    <form
      action={verifyPaymentManual}
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3"
    >
      <input type="hidden" name="paymentId" value={p.id} />
      <div className="text-xs text-amber-800 mb-2">
        ⚠️ Tandai lunas tanpa bukti upload — hanya gunakan kalau Anda yakin
        pembayaran sudah diterima di luar app.
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input
          name="note"
          required
          maxLength={500}
          className="input h-9 text-sm flex-1 min-w-[180px]"
          placeholder="Mis. cash 26 Mei 2026, transfer BCA langsung"
        />
        <button type="submit" className="btn-success h-9 px-3 text-sm">
          Tandai Lunas
        </button>
      </div>
    </form>
  );
}

// ---------- History ----------

function HistoryTable({
  items,
  sort,
  onSort,
}: {
  items: PaymentItem[];
  sort: SortState;
  onSort: (s: SortState) => void;
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="w-12 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                No.
              </th>
              <SortHeader
                label="Penghuni"
                active={sort.key === "nama"}
                dir={sort.dir}
                onClick={() => onSort(toggleSort(sort, "nama", "asc"))}
              />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kamar · Kos
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Periode
              </th>
              <SortHeader
                label="Jumlah"
                align="right"
                active={sort.key === "amount"}
                dir={sort.dir}
                onClick={() => onSort(toggleSort(sort, "amount", "desc"))}
              />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <SortHeader
                label="Verifikasi"
                active={sort.key === "reviewedAt"}
                dir={sort.dir}
                onClick={() =>
                  onSort(toggleSort(sort, "reviewedAt", "desc"))
                }
              />
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bukti
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((p, idx) => {
              const isVerified = p.status === "VERIFIED";
              const isRejected = p.status === "REJECTED";
              const isManual = !!p.reviewNote?.startsWith("[MANUAL]");
              return (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-500">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {p.tenantName}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    Kamar {p.roomName}
                    <span className="ml-1 text-xs text-slate-400">
                      · {p.kosName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {MONTHS[p.periodMonth - 1]} {p.periodYear}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                    {rupiah(p.amount)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {isVerified && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                          {isManual ? "Manual" : "Lunas"}
                        </span>
                      )}
                      {isRejected && (
                        <>
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                            Ditolak
                          </span>
                          <OverdueBadge
                            dueDate={p.dueDate}
                            status={p.status}
                            size="xs"
                          />
                        </>
                      )}
                    </div>
                    {p.reviewNote && (
                      <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                        {p.reviewNote}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {p.reviewedAt
                      ? new Date(p.reviewedAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {p.proofUrl ? (
                      <a
                        href={viewerUrl(p.proofUrl, "Bukti pembayaran")}
                        className="text-sm text-brand-700 hover:underline"
                      >
                        📎 Lihat
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {items.map((p) => (
          <HistoryCard key={p.id} p={p} />
        ))}
      </div>
    </>
  );
}

function HistoryCard({ p }: { p: PaymentItem }) {
  const isVerified = p.status === "VERIFIED";
  const isRejected = p.status === "REJECTED";
  const isManual = !!p.reviewNote?.startsWith("[MANUAL]");
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 truncate">
              {p.tenantName}
            </span>
            {isVerified && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                {isManual ? "Manual" : "Lunas"}
              </span>
            )}
            {isRejected && (
              <>
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                  Ditolak
                </span>
                <OverdueBadge dueDate={p.dueDate} status={p.status} size="xs" />
              </>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Kamar {p.roomName} · {p.kosName}
          </div>
          <div className="text-xs text-slate-500">
            {MONTHS[p.periodMonth - 1]} {p.periodYear} · {rupiah(p.amount)}
            {p.reviewedAt && (
              <>
                {" · "}
                {new Date(p.reviewedAt).toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                })}
              </>
            )}
          </div>
          {p.reviewNote && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
              Catatan: {p.reviewNote}
            </div>
          )}
        </div>
        {p.proofUrl && (
          <a
            href={viewerUrl(p.proofUrl, "Bukti pembayaran")}
            className="shrink-0 text-xs text-brand-700 hover:underline"
          >
            📎 Bukti
          </a>
        )}
      </div>
    </div>
  );
}

// =========================
// Small UI primitives
// =========================

function Section({
  title,
  subtitle,
  count,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  tone?: "amber";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">
          {title}
          {count > 0 && (
            <span
              className={`ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                tone === "amber"
                  ? "bg-amber-400 text-slate-900"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {count}
            </span>
          )}
        </h2>
        {subtitle && (
          <span className="text-xs text-slate-500">{subtitle}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "amber" | "red" | "neutral";
}) {
  const bg =
    tone === "green"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200"
        : tone === "red"
          ? "bg-red-50 border-red-200"
          : "bg-slate-50 border-slate-200";
  const valueColor =
    tone === "green"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-700"
          : "text-slate-800";
  return (
    <div className={`rounded-lg border ${bg} px-3 py-2`}>
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 truncate text-[10px] text-slate-500">
          {sub}
        </div>
      )}
    </div>
  );
}

function PeriodPicker({
  current,
  historyCounts,
  onChange,
}: {
  current: { month: number; year: number };
  historyCounts: { month: number; year: number; count: number }[];
  onChange: (m: number, y: number) => void;
}) {
  const options = useMemo(() => {
    const now = new Date();
    const set = new Set<string>();
    for (let i = -1; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(`${d.getMonth() + 1}-${d.getFullYear()}`);
    }
    for (const h of historyCounts) set.add(`${h.month}-${h.year}`);
    set.add(`${current.month}-${current.year}`);
    return [...set]
      .map((s) => {
        const [m, y] = s.split("-").map(Number);
        return { month: m, year: y };
      })
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  }, [historyCounts, current]);

  return (
    <select
      value={`${current.month}-${current.year}`}
      onChange={(e) => {
        const [m, y] = e.target.value.split("-").map(Number);
        onChange(m, y);
      }}
      className="input h-10 text-sm"
    >
      {options.map((o) => (
        <option key={`${o.month}-${o.year}`} value={`${o.month}-${o.year}`}>
          {MONTHS[o.month - 1]} {o.year}
        </option>
      ))}
    </select>
  );
}
