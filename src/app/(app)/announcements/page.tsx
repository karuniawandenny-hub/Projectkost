import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { EmptyState, InboxIcon } from "@/components/EmptyState";
import { AnnouncementForm } from "./AnnouncementForm";

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
                <div className="shrink-0 text-xs text-slate-500">
                  {formatWhen(a.createdAt)}
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

  const announcements =
    kosIds.length === 0
      ? []
      : await prisma.announcement.findMany({
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
        });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pengumuman</h1>
        <p className="text-sm text-slate-600">
          Informasi dari pemilik kos Anda.
        </p>
      </div>
      {announcements.length === 0 ? (
        <EmptyState
          icon={<InboxIcon />}
          title="Belum ada pengumuman"
          description="Pengumuman dari pemilik kos akan muncul di sini."
        />
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
    </div>
  );
}
