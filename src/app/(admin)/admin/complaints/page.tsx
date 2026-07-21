import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyState, ChatIcon } from "@/components/EmptyState";

const PER_PAGE = 50;

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <span className="badge-yellow">Terbuka</span>;
  if (status === "IN_PROGRESS")
    return <span className="badge-blue">Diproses</span>;
  return <span className="badge-green">Selesai</span>;
}

function clampPage(p: number): number {
  if (!Number.isFinite(p) || p < 1) return 1;
  return Math.floor(p);
}

export default async function AdminComplaintsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; page?: string };
}) {
  const page = clampPage(Number(searchParams.page ?? 1));

  const where: Record<string, unknown> = {};
  if (
    searchParams.status &&
    ["OPEN", "IN_PROGRESS", "RESOLVED"].includes(searchParams.status)
  ) {
    where.status = searchParams.status;
  }
  if (searchParams.q && searchParams.q.trim()) {
    const q = searchParams.q.trim();
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { tenancy: { tenant: { name: { contains: q } } } },
      { tenancy: { room: { kos: { name: { contains: q } } } } },
    ];
  }

  const [total, complaints, statusCounts] = await Promise.all([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        tenancy: {
          include: {
            tenant: { select: { name: true } },
            room: {
              include: {
                kos: {
                  include: { owner: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    }),
    // Count per status untuk badge di filter pills — hemat karena
    // 1 query aggregate.
    prisma.complaint.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus: Record<string, number> = {};
  for (const c of statusCounts) countByStatus[c.status] = c._count._all;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  function buildQuery(patch: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.q) params.set("q", searchParams.q);
    if (page > 1) params.set("page", String(page));
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/admin/complaints?${s}` : "/admin/complaints";
  }

  const filters = [
    { href: buildQuery({ status: null, page: null }), label: "Semua", key: "" },
    {
      href: buildQuery({ status: "OPEN", page: null }),
      label: "Terbuka",
      key: "OPEN",
    },
    {
      href: buildQuery({ status: "IN_PROGRESS", page: null }),
      label: "Diproses",
      key: "IN_PROGRESS",
    },
    {
      href: buildQuery({ status: "RESOLVED", page: null }),
      label: "Selesai",
      key: "RESOLVED",
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Komplain (sistem)</h1>
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="label">
            Cari (judul / deskripsi / tenant / kos)
          </label>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            className="input"
            placeholder="ketik untuk mencari"
          />
        </div>
        <input
          type="hidden"
          name="status"
          value={searchParams.status ?? ""}
        />
        <button type="submit" className="btn-primary">
          Cari
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = (searchParams.status ?? "") === f.key;
          const count =
            f.key === ""
              ? Object.values(countByStatus).reduce((s, n) => s + n, 0)
              : countByStatus[f.key] ?? 0;
          return (
            <Link
              key={f.key}
              href={f.href}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                active
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 text-[10px] tabular-nums ${
                  active ? "text-brand-100" : "text-slate-500"
                }`}
              >
                ({count})
              </span>
            </Link>
          );
        })}
      </div>
      <div className="space-y-2">
        {complaints.length === 0 && (
          <EmptyState
            icon={<ChatIcon />}
            title="Tidak ada komplain"
            description="Komplain dari penghuni di seluruh kos akan muncul di sini."
          />
        )}
        {complaints.map((c) => (
          <Link
            key={c.id}
            href={`/complaints/${c.id}`}
            className="card block hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">{c.title}</div>
                <div className="text-xs text-slate-500">
                  {c.tenancy.tenant.name} → {c.tenancy.room.kos.name} / Kamar{" "}
                  {c.tenancy.room.name} · Pemilik:{" "}
                  {c.tenancy.room.kos.owner.name}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-xs text-slate-500">
            Halaman {page} dari {totalPages} · {total} komplain
          </div>
          <div className="flex gap-1">
            {page > 1 ? (
              <Link
                href={buildQuery({ page: String(page - 1) })}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400">
                ← Sebelumnya
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={buildQuery({ page: String(page + 1) })}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Berikutnya →
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400">
                Berikutnya →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
