"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { viewerUrl } from "@/lib/viewer";
import { TestControls } from "./TestControls";

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

export type AdminPaymentItem = {
  id: string;
  status: "DUE" | "PENDING" | "VERIFIED" | "REJECTED";
  periodMonth: number;
  periodYear: number;
  amount: number;
  dueDateISO: string | null;
  proofUrl: string | null;
  tenantName: string;
  tenantEmail: string;
  kosId: string;
  kosName: string;
  ownerName: string;
  roomName: string;
  reminderCount: number;
};

export function AdminPaymentsView({
  items,
  period,
  page,
  perPage,
  total,
  historyPeriods,
}: {
  items: AdminPaymentItem[];
  period: { month: number; year: number };
  page: number;
  perPage: number;
  total: number;
  historyPeriods: { month: number; year: number }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const currentStatus = searchParams.get("status") ?? "";
  const periodLabel = `${MONTHS[period.month - 1]} ${period.year}`;

  function replaceParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    // Reset ke halaman 1 kalau filter berubah (kecuali kalau yang di-patch
    // hanya "page" itu sendiri).
    if (!("page" in patch)) params.delete("page");
    router.push(`/admin/payments?${params.toString()}`);
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    replaceParams({ q: search.trim() || null });
  }

  // Group by kos (client-side, dari halaman aktif)
  const filtered = useMemo(() => {
    // Untuk halaman aktif items sudah difilter server. Kita hanya
    // klien-side re-filter search saat user mengetik SEBELUM submit.
    return items;
  }, [items]);

  const groups = useMemo(() => {
    const byKos = new Map<
      string,
      { name: string; ownerName: string; items: AdminPaymentItem[] }
    >();
    for (const p of filtered) {
      const g = byKos.get(p.kosId) ?? {
        name: p.kosName,
        ownerName: p.ownerName,
        items: [],
      };
      g.items.push(p);
      byKos.set(p.kosId, g);
    }
    return [...byKos.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const stats = useMemo(() => {
    return {
      pending: items.filter((p) => p.status === "PENDING").length,
      due: items.filter((p) => p.status === "DUE").length,
      verified: items.filter((p) => p.status === "VERIFIED").length,
      verifiedAmount: items
        .filter((p) => p.status === "VERIFIED")
        .reduce((s, p) => s + p.amount, 0),
    };
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const periodOptions = useMemo(() => {
    const now = new Date();
    const set = new Set<string>();
    for (let i = -1; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(`${d.getMonth() + 1}-${d.getFullYear()}`);
    }
    for (const h of historyPeriods) set.add(`${h.month}-${h.year}`);
    set.add(`${period.month}-${period.year}`);
    return [...set]
      .map((s) => {
        const [m, y] = s.split("-").map(Number);
        return { month: m, year: y };
      })
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  }, [historyPeriods, period]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form onSubmit={onSearchSubmit} className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari tenant, email, kos, kamar… (Enter untuk cari)"
              className="input h-10 w-full pl-9 text-[16px]"
              autoComplete="off"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔍
            </span>
          </form>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">
              Periode:
            </label>
            <select
              value={`${period.month}-${period.year}`}
              onChange={(e) => {
                const [m, y] = e.target.value.split("-").map(Number);
                replaceParams({ month: String(m), year: String(y) });
              }}
              className="input h-10 text-sm"
            >
              {periodOptions.map((o) => (
                <option
                  key={`${o.month}-${o.year}`}
                  value={`${o.month}-${o.year}`}
                >
                  {MONTHS[o.month - 1]} {o.year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { v: "", l: "Semua", c: stats.pending + stats.due + stats.verified },
              { v: "PENDING", l: "Menunggu", c: stats.pending },
              { v: "DUE", l: "Terbuka", c: stats.due },
              { v: "VERIFIED", l: "Lunas", c: stats.verified },
              { v: "REJECTED", l: "Ditolak", c: -1 },
            ] as const
          ).map((f) => (
            <button
              key={f.v || "all"}
              type="button"
              onClick={() => replaceParams({ status: f.v || null })}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                currentStatus === f.v
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.l}
              {f.c >= 0 && (
                <span
                  className={`ml-1.5 text-[10px] tabular-nums ${
                    currentStatus === f.v ? "text-brand-100" : "text-slate-500"
                  }`}
                >
                  ({f.c})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Groups */}
      {items.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Tidak ada pembayaran di {periodLabel}
          {currentStatus ? ` untuk status ${currentStatus}` : ""}. Ganti periode
          atau filter di atas.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const isCollapsed = collapsed[g.id] ?? false;
            const groupTotal = g.items.reduce((s, p) => s + p.amount, 0);
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
                      · owner: {g.ownerName}
                    </span>
                    <span className="text-xs text-slate-500">
                      ({g.items.length})
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-600 tabular-nums">
                    {rupiahShort(groupTotal)}
                  </span>
                </button>
                {!isCollapsed && (
                  <ul className="divide-y divide-slate-100">
                    {g.items.map((p) => (
                      <li key={p.id}>
                        <AdminPaymentRow p={p} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-xs text-slate-500">
            Halaman {page} dari {totalPages} · {total} pembayaran total
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => replaceParams({ page: String(page - 1) })}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => replaceParams({ page: String(page + 1) })}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Berikutnya →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPaymentRow({ p }: { p: AdminPaymentItem }) {
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
            {p.dueDateISO && (
              <>
                {" · jatuh tempo "}
                {new Date(p.dueDateISO).toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                })}
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <StatusBadge status={p.status} />
          {p.proofUrl && (
            <a
              href={viewerUrl(p.proofUrl, "Bukti pembayaran")}
              className="text-xs text-brand-700 hover:underline"
            >
              📎 Bukti
            </a>
          )}
          {p.status === "VERIFIED" && (
            <Link
              href={`/payments/${p.id}/receipt`}
              className="text-xs text-emerald-700 hover:underline"
            >
              📄 Kuitansi
            </Link>
          )}
        </div>
      </div>
      <div className="mt-2">
        <TestControls paymentId={p.id} reminderCount={p.reminderCount} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "DUE") return <span className="badge-yellow">Belum upload</span>;
  if (status === "PENDING") return <span className="badge-yellow">Menunggu</span>;
  if (status === "VERIFIED") return <span className="badge-green">Lunas</span>;
  return <span className="badge-red">Ditolak</span>;
}
