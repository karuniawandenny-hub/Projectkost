import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
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

  const isTenant = user.role === "TENANT";

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

  // Scope:
  //  - ADMIN: bebas.
  //  - OWNER: hanya kos miliknya.
  //  - TENANT: HANYA perawatan untuk kamar yang sedang dia sewa aktif.
  //    Perawatan level kos (roomId=null, mis. pompa air, AC lorong)
  //    TIDAK ditampilkan di sini — sudah dipindah ke halaman Pengumuman
  //    supaya menu Perawatan tenant fokus & personal.
  const where: Record<string, unknown> = {};
  if (canManageKos(user)) {
    where.kos = { ownerId: getEffectiveOwnerId(user) };
  } else if (isTenant) {
    const activeTenancies = await prisma.tenancy.findMany({
      where: { tenantId: user.id, status: "ACTIVE" },
      select: { roomId: true },
    });
    const roomIds = activeTenancies.map((t) => t.roomId);
    if (roomIds.length === 0) {
      where.id = "__no-match__"; // pasti kosong
    } else {
      where.roomId = { in: roomIds };
    }
  }
  if (typeFilter) where.type = typeFilter;
  if (statusFilter) where.status = statusFilter;
  if (kosFilter && !isTenant) where.kosId = kosFilter;

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
    // Tenant tidak butuh dropdown kos — filter ditiadakan untuknya.
    isTenant
      ? Promise.resolve([])
      : prisma.kos.findMany({
          where: canManageKos(user) ? { ownerId: getEffectiveOwnerId(user) } : {},
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
          <h1 className="text-2xl font-bold">
            {isTenant ? "Perawatan kamar Anda" : "Perawatan kos"}
          </h1>
          <p className="text-sm text-slate-600">
            {isTenant
              ? "Jadwal & riwayat perawatan untuk kamar Anda. Perawatan fasilitas kos bersama (pompa air, AC lorong, dll) ada di menu Pengumuman."
              : "Catat jadwal perawatan preventif, perbaikan korektif manual, dan riwayat dari komplain penghuni."}
          </p>
        </div>
        {!isTenant && (
          <div className="flex gap-2 flex-wrap">
            <ExportButton
              type={typeFilter}
              status={statusFilter}
              kosId={kosFilter}
            />
            <Link href="/maintenance/new" className="btn-primary">
              + Catat perawatan baru
            </Link>
          </div>
        )}
      </div>

      {searchParams?.created && !isTenant && (
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

      {!isTenant && kosList.length > 1 && (
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
          {isTenant
            ? "Belum ada catatan perawatan untuk kamar Anda. Anda akan mendapat notifikasi di sini ketika pemilik menjadwalkan perawatan."
            : "Belum ada catatan perawatan. Buat jadwal preventif baru, atau tunggu penghuni mengirim komplain untuk auto-create record korektif."}
        </div>
      ) : (
        <>
          <Section title="Terjadwal" items={scheduled} />
          <Section title="Dalam proses" items={inProgress} />
          <Section title="Selesai" items={completed} defaultCollapsed />
          <Section title="Dibatalkan" items={cancelled} defaultCollapsed />
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

function Section({
  title,
  items,
  defaultCollapsed,
}: {
  title: string;
  items: ItemRow[];
  defaultCollapsed?: boolean;
}) {
  if (items.length === 0) return null;
  // Pakai native <details> untuk collapse — nol JS, nol client boundary,
  // aksesibel by default. `open` attribute mengontrol default state:
  //   Terjadwal / Dalam proses → open (aktif, prioritas)
  //   Selesai / Dibatalkan → collapsed (arsip, tidak overwhelm)
  return (
    <section className="space-y-3">
      <details className="group" open={!defaultCollapsed}>
        <summary className="flex cursor-pointer items-center gap-2 select-none list-none [&::-webkit-details-marker]:hidden">
          <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">
            ▶
          </span>
          <h2 className="text-sm font-semibold text-slate-500">
            {title} ({items.length})
          </h2>
        </summary>
        <div className="mt-3 space-y-2">
          {items.map((m) => (
            <MaintenanceCard key={m.id} m={m} />
          ))}
        </div>
      </details>
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

/**
 * Tombol export CSV dengan rentang tanggal opsional. Pakai <a download>
 * langsung supaya browser handle download tanpa JS — file ter-stream
 * dari API route dengan Content-Disposition.
 */
function ExportButton({
  type,
  status,
  kosId,
}: {
  type?: string;
  status?: string;
  kosId?: string;
}) {
  // Default rentang: 1 tahun terakhir supaya laporan tahunan default OK.
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(now.getFullYear() - 1);
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (kosId) params.set("kosId", kosId);
  params.set("from", toIso(yearAgo));
  params.set("to", toIso(now));
  const href = `/api/maintenance/export?${params.toString()}`;
  return (
    <a
      href={href}
      download
      className="btn-secondary inline-flex items-center gap-1"
      title="Download laporan biaya CSV (default: 1 tahun terakhir, mengikuti filter saat ini)"
    >
      📊 Export CSV
    </a>
  );
}
