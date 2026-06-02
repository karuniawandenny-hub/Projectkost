import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  formatDateID,
  formatRupiah,
  statusBadgeClass,
  statusLabel,
  typeLabel,
} from "@/lib/maintenance";

type SearchParams = {
  type?: string;
  status?: string;
  kosId?: string;
  created?: string;
};

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // Filter param
  const typeFilter =
    searchParams?.type && ["PREVENTIVE", "CORRECTIVE"].includes(searchParams.type)
      ? searchParams.type
      : undefined;
  const statusFilter =
    searchParams?.status &&
    ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(
      searchParams.status
    )
      ? searchParams.status
      : undefined;
  const kosFilter = searchParams?.kosId || undefined;

  // Scope: OWNER hanya lihat kos miliknya. ADMIN bebas.
  const where: Record<string, unknown> = {};
  if (user.role === "OWNER") {
    where.kos = { ownerId: user.id };
  }
  if (typeFilter) where.type = typeFilter;
  if (statusFilter) where.status = statusFilter;
  if (kosFilter) where.kosId = kosFilter;

  const [items, kosList] = await Promise.all([
    prisma.maintenance.findMany({
      where,
      include: {
        kos: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { scheduledDate: "asc" }],
      take: 200,
    }),
    prisma.kos.findMany({
      where: user.role === "OWNER" ? { ownerId: user.id } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const scheduled = items.filter((m) => m.status === "SCHEDULED");
  const inProgress = items.filter((m) => m.status === "IN_PROGRESS");
  const completed = items.filter((m) => m.status === "COMPLETED");
  const cancelled = items.filter((m) => m.status === "CANCELLED");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Perawatan kos</h1>
          <p className="text-sm text-slate-600">
            Catat jadwal perawatan preventif & lihat riwayat perbaikan korektif
            dari komplain penghuni.
          </p>
        </div>
        <Link href="/maintenance/new" className="btn-primary">
          + Jadwal perawatan baru
        </Link>
      </div>

      {searchParams?.created && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✓ Jadwal perawatan tersimpan. Anda akan dapat pengingat H-7, H-3,
          dan H-1 sebelum tanggal jadwal.
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap gap-2 text-sm">
        <FilterPill href="/maintenance" active={!typeFilter && !statusFilter && !kosFilter}>
          Semua
        </FilterPill>
        <FilterPill href="/maintenance?type=PREVENTIVE" active={typeFilter === "PREVENTIVE"}>
          Preventif
        </FilterPill>
        <FilterPill href="/maintenance?type=CORRECTIVE" active={typeFilter === "CORRECTIVE"}>
          Korektif (dari komplain)
        </FilterPill>
        <FilterPill href="/maintenance?status=SCHEDULED" active={statusFilter === "SCHEDULED"}>
          Terjadwal
        </FilterPill>
        <FilterPill href="/maintenance?status=IN_PROGRESS" active={statusFilter === "IN_PROGRESS"}>
          Dalam proses
        </FilterPill>
        <FilterPill href="/maintenance?status=COMPLETED" active={statusFilter === "COMPLETED"}>
          Selesai
        </FilterPill>
      </div>

      {kosList.length > 1 && (
        <form className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Kos:</label>
          <select
            name="kosId"
            defaultValue={kosFilter ?? ""}
            className="input max-w-xs"
          >
            <option value="">Semua kos</option>
            {kosList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Belum ada catatan perawatan. Buat jadwal preventif baru, atau
          tunggu penghuni mengirim komplain untuk auto-create record korektif.
        </div>
      ) : (
        <>
          <Section title="Terjadwal" items={scheduled} />
          <Section title="Dalam proses" items={inProgress} />
          <Section title="Selesai" items={completed} />
          <Section title="Dibatalkan" items={cancelled} />
        </>
      )}
    </div>
  );
}

type ItemRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  scheduledDate: Date;
  completedDate: Date | null;
  cost: number | null;
  vendor: string | null;
  recurrenceMonths: number | null;
  kos: { id: string; name: string };
  room: { id: string; name: string } | null;
};

function Section({ title, items }: { title: string; items: ItemRow[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-500">
        {title} ({items.length})
      </h2>
      <div className="space-y-2">
        {items.map((m) => (
          <MaintenanceCard key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}

function MaintenanceCard({ m }: { m: ItemRow }) {
  return (
    <Link href={`/maintenance/${m.id}`} className="block card hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`badge ${m.type === "PREVENTIVE" ? "badge-blue" : "badge-violet"}`}>
              {typeLabel(m.type)}
            </span>
            <span className={`badge ${statusBadgeClass(m.status)}`}>
              {statusLabel(m.status)}
            </span>
            {m.recurrenceMonths ? (
              <span className="badge-slate text-xs">↻ tiap {m.recurrenceMonths} bln</span>
            ) : null}
          </div>
          <div className="mt-1.5 font-semibold">{m.title}</div>
          <div className="text-xs text-slate-500">
            {m.kos.name}
            {m.room ? ` • Kamar ${m.room.name}` : " • Fasilitas kos"}
          </div>
          {m.description && (
            <div className="mt-1 text-sm text-slate-600 line-clamp-2">
              {m.description}
            </div>
          )}
        </div>
        <div className="text-right text-xs text-slate-500 shrink-0">
          <div>Jadwal: {formatDateID(m.scheduledDate)}</div>
          {m.completedDate && (
            <div>Selesai: {formatDateID(m.completedDate)}</div>
          )}
          {m.cost != null && <div>{formatRupiah(m.cost)}</div>}
          {m.vendor && <div>oleh {m.vendor}</div>}
        </div>
      </div>
    </Link>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 border ${
        active
          ? "bg-brand-600 text-white border-brand-600"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}
