import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyState, ChatIcon } from "@/components/EmptyState";

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <span className="badge-yellow">Terbuka</span>;
  if (status === "IN_PROGRESS") return <span className="badge-blue">Diproses</span>;
  return <span className="badge-green">Selesai</span>;
}

export default async function AdminComplaintsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
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
  const complaints = await prisma.complaint.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      tenancy: {
        include: {
          tenant: { select: { name: true } },
          room: { include: { kos: { include: { owner: { select: { name: true } } } } } },
        },
      },
    },
  });

  const filters = [
    { href: "/admin/complaints", label: "Semua" },
    { href: "/admin/complaints?status=OPEN", label: "Terbuka" },
    { href: "/admin/complaints?status=IN_PROGRESS", label: "Diproses" },
    { href: "/admin/complaints?status=RESOLVED", label: "Selesai" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Komplain (sistem)</h1>
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Cari (judul / deskripsi / tenant / kos)</label>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            className="input"
            placeholder="ketik untuk mencari"
          />
        </div>
        <input type="hidden" name="status" value={searchParams.status ?? ""} />
        <button type="submit" className="btn-primary">
          Cari
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
          >
            {f.label}
          </Link>
        ))}
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
                  {c.tenancy.room.name} • Pemilik: {c.tenancy.room.kos.owner.name}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
