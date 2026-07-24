import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { EmptyState, InboxIcon } from "@/components/EmptyState";
import { AnnouncementForm } from "./AnnouncementForm";
import { DeleteAnnouncementButton } from "./DeleteAnnouncementButton";
import {
  formatDateID,
  statusBadgeClass,
  statusLabel,
  typeLabel,
} from "@/lib/maintenance";

function formatWhen(d: Date): string {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "OWNER" || user.role === "ADMIN") {
    return <OwnerView userId={user.id} role={user.role} />;
  }
  return <TenantView userId={user.id} />;
}

/* ============================ OWNER / ADMIN ============================ */
async function OwnerView({ userId, role }: { userId: string; role: string }) {
  const [kosList, history] = await Promise.all([
    prisma.kos.findMany({
      where: role === "OWNER" ? { ownerId: userId } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.announcement.findMany({
      where: role === "OWNER" ? { authorId: userId } : {},
      include: { kos: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pengumuman</h1>
        <p className="text-sm text-slate-600">
          Kirim informasi ke seluruh penghuni — mati air, kerja bakti,
          perubahan aturan, dll.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Buat pengumuman baru</h2>
        <AnnouncementForm kosList={kosList} />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">
          Riwayat ({history.length})
        </h2>
        {history.length === 0 ? (
          <div className="card text-sm text-slate-500">
            Belum ada pengumuman terkirim.
          </div>
        ) : (
          history.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">{a.title}</div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="text-xs text-slate-500">
                    {formatWhen(a.createdAt)}
                  </div>
                  <DeleteAnnouncementButton id={a.id} />
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {a.body}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="badge-slate">
                  {a.kos ? a.kos.name : "Semua kos"}
                </span>
                <span className="badge-slate">
                  {a.audienceCount} penghuni
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================== TENANT ================================ */
async function TenantView({ userId }: { userId: string }) {
  // Kos & owner dari tenancy aktif penghuni → tentukan pengumuman relevan.
  const tenancies = await prisma.tenancy.findMany({
    where: { tenantId: userId, status: "ACTIVE" },
    select: { room: { select: { kosId: true, kos: { select: { ownerId: true } } } } },
  });
  const kosIds = Array.from(new Set(tenancies.map((t) => t.room.kosId)));
  const ownerIds = Array.from(
    new Set(tenancies.map((t) => t.room.kos.ownerId))
  );

  const [announcements, kosMaintenances] = await Promise.all([
    kosIds.length === 0
      ? Promise.resolve([])
      : prisma.announcement.findMany({
          where: {
            OR: [
              { kosId: { in: kosIds } },
              // Pengumuman "semua kos" dari pemilik kos yang dia tinggali.
              { kosId: null, authorId: { in: ownerIds } },
            ],
          },
          include: { kos: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
    // Perawatan LEVEL KOS (roomId=null) — dipindah dari dashboard tenant
    // ke halaman Pengumuman. Hanya yang aktif (SCHEDULED / IN_PROGRESS).
    kosIds.length === 0
      ? Promise.resolve([])
      : prisma.maintenance.findMany({
          where: {
            kosId: { in: kosIds },
            roomId: null,
            status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          },
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            status: true,
            scheduledDate: true,
            kos: { select: { name: true } },
          },
          orderBy: [{ status: "asc" }, { scheduledDate: "asc" }],
          take: 20,
        }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pengumuman</h1>
        <p className="text-sm text-slate-600">
          Informasi dari pemilik kos Anda.
        </p>
      </div>

      {/* Section: Perawatan Fasilitas Kos */}
      {kosMaintenances.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">
            🛠️ Perawatan Fasilitas Kos ({kosMaintenances.length})
          </h2>
          <p className="text-xs text-slate-500">
            Perawatan fasilitas bersama (pompa, taman, AC lorong, dll) yang
            terjadwal atau sedang berlangsung di kos Anda.
          </p>
          <div className="space-y-2">
            {kosMaintenances.map((m) => (
              <Link
                key={m.id}
                href={`/maintenance/${m.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`badge text-[10px] ${
                          m.type === "PREVENTIVE"
                            ? "badge-blue"
                            : "badge-violet"
                        }`}
                      >
                        {typeLabel(m.type)}
                      </span>
                      <span
                        className={`badge text-[10px] ${statusBadgeClass(m.status)}`}
                      >
                        {statusLabel(m.status)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        · {m.kos.name}
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-800">
                      {m.title}
                    </div>
                    {m.description && (
                      <p className="mt-0.5 text-sm text-slate-600 line-clamp-2">
                        {m.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-500">
                    Jadwal
                    <div className="font-medium text-slate-700 tabular-nums">
                      {formatDateID(m.scheduledDate)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Section: Pengumuman */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">
          📢 Pengumuman ({announcements.length})
        </h2>
        {announcements.length === 0 && kosMaintenances.length === 0 ? (
          <EmptyState
            icon={<InboxIcon />}
            title="Belum ada pengumuman"
            description="Pengumuman dari pemilik kos akan muncul di sini."
          />
        ) : announcements.length === 0 ? (
          <div className="card text-sm text-slate-500">
            Belum ada pengumuman teks dari pemilik.
          </div>
        ) : (
          <div className="space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold">{a.title}</div>
                  <div className="shrink-0 text-xs text-slate-500">
                    {formatWhen(a.createdAt)}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {a.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
