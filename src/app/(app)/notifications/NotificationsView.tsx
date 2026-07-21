"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAtISO: string;
};

export function NotificationsView({
  items,
  page,
  perPage,
  total,
  unreadTotal,
  filter,
}: {
  items: NotificationItem[];
  page: number;
  perPage: number;
  total: number;
  unreadTotal: number;
  filter: "all" | "unread";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setFilter(next: "all" | "unread") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "unread") params.set("unread", "1");
    else params.delete("unread");
    params.delete("page"); // reset ke halaman 1
    router.push(`/notifications?${params.toString()}`);
  }

  function goPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (n <= 1) params.delete("page");
    else params.set("page", String(n));
    router.push(`/notifications?${params.toString()}`);
  }

  // Group by relative date bucket.
  const groups = useMemo(() => groupByDate(items), [items]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded px-3 py-1.5 font-medium transition ${
            filter === "all"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Semua
          <span
            className={`ml-1.5 text-[10px] tabular-nums ${
              filter === "all" ? "text-brand-100" : "text-slate-500"
            }`}
          >
            ({total})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`rounded px-3 py-1.5 font-medium transition ${
            filter === "unread"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Belum dibaca
          {unreadTotal > 0 && (
            <span
              className={`ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
                filter === "unread"
                  ? "bg-white text-brand-700"
                  : "bg-amber-400 text-slate-900"
              }`}
            >
              {unreadTotal}
            </span>
          )}
        </button>
      </div>

      {/* Groups */}
      {items.length === 0 ? (
        <div className="card text-sm text-slate-500">
          {filter === "unread"
            ? "Tidak ada notifikasi belum dibaca."
            : "Belum ada notifikasi di halaman ini."}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.label}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {g.label}
              </h3>
              <div className="space-y-1.5">
                {g.items.map((n) => (
                  <NotifRow key={n.id} n={n} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-xs text-slate-500">
            Halaman {page} dari {totalPages} · {total} notifikasi
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Baru
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Lebih lama →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({ n }: { n: NotificationItem }) {
  const body = (
    <div
      className={`rounded-lg border px-3 py-2 transition ${
        n.read
          ? "border-slate-200 bg-white hover:bg-slate-50"
          : "border-brand-300 bg-brand-50/60 hover:bg-brand-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {!n.read && (
              <span
                aria-label="Belum dibaca"
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600"
              />
            )}
            <div className="font-medium text-slate-800 truncate">
              {n.title}
            </div>
          </div>
          <p className="mt-0.5 text-sm text-slate-600 line-clamp-2">
            {n.message}
          </p>
        </div>
        <div className="shrink-0 text-[11px] text-slate-500 tabular-nums">
          {new Date(n.createdAtISO).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
  return n.link ? <Link href={n.link}>{body}</Link> : body;
}

/**
 * Kelompokkan notifikasi ke bucket relatif:
 *  - Hari ini
 *  - Kemarin
 *  - N hari lalu (untuk 2-6 hari lalu)
 *  - Minggu lalu (untuk 7-13 hari)
 *  - Lebih lama
 * Pertahankan urutan asli (desc by createdAt) — caller sudah sort.
 */
function groupByDate(
  items: NotificationItem[]
): { label: string; items: NotificationItem[] }[] {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets = new Map<string, NotificationItem[]>();
  const order: string[] = [];

  const push = (label: string, item: NotificationItem) => {
    if (!buckets.has(label)) {
      buckets.set(label, []);
      order.push(label);
    }
    buckets.get(label)!.push(item);
  };

  for (const it of items) {
    const d = new Date(it.createdAtISO);
    const days = Math.floor(
      (startOfDay.getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        86_400_000
    );
    if (days <= 0) push("Hari ini", it);
    else if (days === 1) push("Kemarin", it);
    else if (days < 7) push(`${days} hari lalu`, it);
    else if (days < 14) push("Minggu lalu", it);
    else push("Lebih lama", it);
  }

  return order.map((label) => ({ label, items: buckets.get(label)! }));
}
