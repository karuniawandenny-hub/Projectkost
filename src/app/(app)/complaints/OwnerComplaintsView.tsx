"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  OPEN: "Terbuka",
  IN_PROGRESS: "Dalam proses",
  RESOLVED: "Selesai",
};

const STATUS_COLOR: Record<Status, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
};

export type ComplaintItem = {
  id: string;
  title: string;
  description: string;
  status: Status;
  createdAtISO: string;
  tenantName: string;
  kosName: string;
  roomName: string;
  photoCount: number;
};

type FilterStatus = "all" | Status;

export function OwnerComplaintsView({
  complaints,
}: {
  complaints: ComplaintItem[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  // Collapse default: OPEN expanded, IN_PROGRESS expanded (masih butuh
  // aksi), RESOLVED collapsed (arsip). User bisa override per section.
  const [collapsed, setCollapsed] = useState<Partial<Record<Status, boolean>>>({
    RESOLVED: true,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return complaints.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      const hay =
        `${c.title} ${c.description} ${c.tenantName} ${c.roomName} ${c.kosName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [complaints, search, filter]);

  const counts = useMemo(() => {
    return {
      OPEN: complaints.filter((c) => c.status === "OPEN").length,
      IN_PROGRESS: complaints.filter((c) => c.status === "IN_PROGRESS").length,
      RESOLVED: complaints.filter((c) => c.status === "RESOLVED").length,
    };
  }, [complaints]);

  const groups: { status: Status; items: ComplaintItem[] }[] = STATUSES.map(
    (s) => ({
      status: s,
      items: filtered.filter((c) => c.status === s),
    })
  );

  const totalMatched = filtered.length;

  return (
    <div className="space-y-4">
      {/* Stat pills */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Terbuka"
          value={counts.OPEN}
          tone="amber"
          active={filter === "OPEN"}
          onClick={() =>
            setFilter((f) => (f === "OPEN" ? "all" : "OPEN"))
          }
        />
        <StatTile
          label="Dalam proses"
          value={counts.IN_PROGRESS}
          tone="blue"
          active={filter === "IN_PROGRESS"}
          onClick={() =>
            setFilter((f) => (f === "IN_PROGRESS" ? "all" : "IN_PROGRESS"))
          }
        />
        <StatTile
          label="Selesai"
          value={counts.RESOLVED}
          tone="emerald"
          active={filter === "RESOLVED"}
          onClick={() =>
            setFilter((f) => (f === "RESOLVED" ? "all" : "RESOLVED"))
          }
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama penghuni, kamar, judul komplain…"
            className="input h-10 w-full pl-9 text-[16px]"
            autoComplete="off"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
        </div>
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
          <FilterBtn
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Semua
          </FilterBtn>
          <FilterBtn
            active={filter === "OPEN"}
            onClick={() => setFilter("OPEN")}
          >
            Terbuka
          </FilterBtn>
          <FilterBtn
            active={filter === "IN_PROGRESS"}
            onClick={() => setFilter("IN_PROGRESS")}
          >
            Diproses
          </FilterBtn>
          <FilterBtn
            active={filter === "RESOLVED"}
            onClick={() => setFilter("RESOLVED")}
          >
            Selesai
          </FilterBtn>
        </div>
      </div>

      {/* Groups per status */}
      {complaints.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Belum ada komplain dari penghuni kos Anda.
        </div>
      ) : totalMatched === 0 ? (
        <div className="card text-sm text-slate-500">
          Tidak ada komplain yang cocok dengan pencarian/filter.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            if (g.items.length === 0) return null;
            const isCollapsed = collapsed[g.status] ?? false;
            return (
              <div
                key={g.status}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({
                      ...c,
                      [g.status]: !isCollapsed,
                    }))
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {isCollapsed ? "▶" : "▼"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[g.status]}`}
                    >
                      {STATUS_LABEL[g.status]}
                    </span>
                    <span className="text-sm text-slate-500">
                      ({g.items.length})
                    </span>
                  </div>
                </button>
                {!isCollapsed && (
                  <ul className="divide-y divide-slate-100">
                    {g.items.map((c) => (
                      <ComplaintRow key={c.id} c={c} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComplaintRow({ c }: { c: ComplaintItem }) {
  return (
    <li>
      <Link
        href={`/complaints/${c.id}`}
        className="flex items-start gap-3 px-3 py-3 hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800 truncate">{c.title}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {c.tenantName} · {c.kosName} · Kamar {c.roomName}
          </div>
          <p className="mt-1 text-sm text-slate-600 line-clamp-1">
            {c.description}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-slate-500 tabular-nums">
          {new Date(c.createdAtISO).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
          {c.photoCount > 0 && (
            <div className="mt-1 text-slate-400">📎 {c.photoCount}</div>
          )}
        </div>
      </Link>
    </li>
  );
}

function StatTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "emerald";
  active: boolean;
  onClick: () => void;
}) {
  const bg =
    tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : tone === "blue"
        ? "bg-blue-50 border-blue-200"
        : "bg-emerald-50 border-emerald-200";
  const valColor =
    tone === "amber"
      ? "text-amber-700"
      : tone === "blue"
        ? "text-blue-700"
        : "text-emerald-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition ${bg} ${
        active ? "ring-2 ring-brand-500" : "hover:brightness-95"
      }`}
    >
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${valColor}`}>
        {value}
      </div>
    </button>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}
