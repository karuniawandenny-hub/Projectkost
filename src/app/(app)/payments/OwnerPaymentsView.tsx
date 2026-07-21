"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { viewerUrl } from "@/lib/viewer";
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
};

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
  // Untuk info di dropdown periode — jumlah row tiap periode yang ada
  historyCountsByPeriod: { month: number; year: number; count: number }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");

  const applySearch = (p: PaymentItem): boolean => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.tenantName.toLowerCase().includes(q) ||
      p.roomName.toLowerCase().includes(q) ||
      p.kosName.toLowerCase().includes(q)
    );
  };

  const pendingFiltered = useMemo(
    () => pending.filter(applySearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, search]
  );
  const dueFiltered = useMemo(
    () => due.filter(applySearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [due, search]
  );
  const historyFiltered = useMemo(
    () => history.filter(applySearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, search]
  );

  const stats = useMemo(() => {
    const dueAmount = due.reduce((s, p) => s + p.amount, 0);
    const pendingAmount = pending.reduce((s, p) => s + p.amount, 0);
    const verifiedAmount = history
      .filter((p) => p.status === "VERIFIED")
      .reduce((s, p) => s + p.amount, 0);
    return {
      pendingCount: pending.length,
      pendingAmount,
      dueCount: due.length,
      dueAmount,
      historyCount: history.length,
      verifiedAmount,
    };
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
          <div className="flex items-center gap-2">
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
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          <div className="card text-sm text-slate-500">
            Tidak ada pembayaran menunggu verifikasi di {periodLabel}.
          </div>
        ) : pendingFiltered.length === 0 ? (
          <div className="card text-sm text-slate-500">
            Tidak ada yang cocok dengan pencarian.
          </div>
        ) : (
          <KosGroupedList
            items={pendingFiltered}
            renderRow={(p) => <PendingRow key={p.id} p={p} />}
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
          <div className="card text-sm text-slate-500">
            Tidak ada tagihan terbuka di {periodLabel}.
          </div>
        ) : dueFiltered.length === 0 ? (
          <div className="card text-sm text-slate-500">
            Tidak ada yang cocok dengan pencarian.
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-500">
              Penghuni belum upload bukti. Kalau Anda menerima pembayaran di
              luar app (cash / transfer manual), bisa tandai lunas via tombol
              di setiap baris.
            </p>
            <KosGroupedList
              items={dueFiltered}
              renderRow={(p) => <DueRow key={p.id} p={p} />}
            />
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
          <div className="card text-sm text-slate-500">
            Belum ada riwayat verifikasi/tolak di {periodLabel}. Ganti periode
            di toolbar untuk lihat bulan lain.
          </div>
        ) : historyFiltered.length === 0 ? (
          <div className="card text-sm text-slate-500">
            Tidak ada yang cocok dengan pencarian.
          </div>
        ) : (
          <KosGroupedList
            items={historyFiltered}
            renderRow={(p) => <HistoryRow key={p.id} p={p} />}
          />
        )}
      </Section>
    </div>
  );
}

// =========================
// Sub-components
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

function KosGroupedList({
  items,
  renderRow,
}: {
  items: PaymentItem[];
  renderRow: (p: PaymentItem) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const byKos = new Map<string, { name: string; items: PaymentItem[] }>();
    for (const p of items) {
      const g = byKos.get(p.kosId) ?? { name: p.kosName, items: [] };
      g.items.push(p);
      byKos.set(p.kosId, g);
    }
    return [...byKos.entries()]
      .map(([id, g]) => ({ id, name: g.name, items: g.items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  return (
    <div className="space-y-2">
      {groups.map((g, idx) => {
        const userState = collapsed[g.id];
        const isCollapsed = userState === undefined ? false : userState;
        const totalAmount = g.items.reduce((s, p) => s + p.amount, 0);
        return (
          <div
            key={g.id}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <button
              type="button"
              onClick={() =>
                setCollapsed((c) => ({ ...c, [g.id]: !isCollapsed }))
              }
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-slate-400">
                  {isCollapsed ? "▶" : "▼"}
                </span>
                <span className="truncate font-semibold text-slate-800">
                  {g.name}
                </span>
                <span className="text-xs text-slate-500">
                  ({g.items.length})
                </span>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-600 tabular-nums">
                {rupiahShort(totalAmount)}
              </span>
            </button>
            {!isCollapsed && (
              <ul className="divide-y divide-slate-100">
                {g.items.map((p) => (
                  <li key={p.id}>{renderRow(p)}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PendingRow({ p }: { p: PaymentItem }) {
  return (
    <div className="px-3 py-3 space-y-2 hover:bg-slate-50/60">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">
            {p.tenantName}{" "}
            <span className="text-xs font-normal text-slate-500">
              · Kamar {p.roomName}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {MONTHS[p.periodMonth - 1]} {p.periodYear} · {rupiah(p.amount)}
          </div>
          {p.note && (
            <div className="text-xs text-slate-500 mt-0.5">
              Catatan penghuni: {p.note}
            </div>
          )}
        </div>
        {p.proofUrl && (
          <a
            href={viewerUrl(p.proofUrl, "Bukti pembayaran")}
            className="shrink-0 text-sm font-medium text-brand-700 hover:underline"
          >
            📎 Lihat bukti
          </a>
        )}
      </div>
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
    </div>
  );
}

function DueRow({ p }: { p: PaymentItem }) {
  const [openManual, setOpenManual] = useState(false);
  return (
    <div className="px-3 py-3 hover:bg-slate-50/60">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">
            {p.tenantName}{" "}
            <span className="text-xs font-normal text-slate-500">
              · Kamar {p.roomName}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {MONTHS[p.periodMonth - 1]} {p.periodYear} · {rupiah(p.amount)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpenManual((v) => !v)}
          className="shrink-0 text-sm font-medium text-brand-700 hover:underline"
        >
          {openManual ? "Batal" : "Tandai lunas manual"}
        </button>
      </div>
      {openManual && (
        <form
          action={verifyPaymentManual}
          className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3"
        >
          <input type="hidden" name="paymentId" value={p.id} />
          <div className="text-xs text-amber-800 mb-2">
            ⚠️ Tandai lunas tanpa bukti upload — hanya gunakan kalau Anda
            yakin pembayaran sudah diterima di luar app.
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
      )}
    </div>
  );
}

function HistoryRow({ p }: { p: PaymentItem }) {
  const isVerified = p.status === "VERIFIED";
  const isRejected = p.status === "REJECTED";
  const isManual = !!p.reviewNote?.startsWith("[MANUAL]");
  return (
    <div className="px-3 py-2.5 hover:bg-slate-50/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 truncate">
              {p.tenantName}
            </span>
            <span className="text-xs text-slate-500">
              · Kamar {p.roomName}
            </span>
            {isVerified && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                {isManual ? "Manual" : "Lunas"}
              </span>
            )}
            {isRejected && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                Ditolak
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
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

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "amber" | "neutral";
}) {
  const bg =
    tone === "green"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200"
        : "bg-slate-50 border-slate-200";
  const valueColor =
    tone === "green"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
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
  // Build list of periods to show in dropdown — union dari (bulan berjalan
  // ± 12 bulan) dan periode yang punya data historical. Diurut desc.
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
