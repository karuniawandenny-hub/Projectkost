import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { endTenancy } from "../kos/actions";
import { PendingTenantCard, type KosOption } from "./PendingTenantCard";

export default async function TenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/dashboard");

  const [tenancies, pendingTenants, kosWithRooms] = await Promise.all([
    prisma.tenancy.findMany({
      where: { status: "ACTIVE", room: { kos: { ownerId: user.id } } },
      include: { tenant: true, room: { include: { kos: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "TENANT", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.kos.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      include: {
        rooms: {
          where: { status: "AVAILABLE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, monthlyPrice: true },
        },
      },
    }),
  ]);

  const kosOptions: KosOption[] = kosWithRooms.map((k) => ({
    id: k.id,
    name: k.name,
    rooms: k.rooms,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Penghuni</h1>
        <p className="text-slate-600">
          Setujui pengajuan penghuni, assign ke kamar, dan kelola penghuni
          aktif Anda di satu tempat.
        </p>
      </div>

      {/* ===== Section: Pengajuan menunggu ===== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">
            Pengajuan menunggu
            {pendingTenants.length > 0 && (
              <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900">
                {pendingTenants.length}
              </span>
            )}
          </h2>
          {kosOptions.length === 0 && (
            <Link href="/kos" className="text-sm text-brand-700 hover:underline">
              Tambahkan kos & kamar dulu →
            </Link>
          )}
        </div>

        {pendingTenants.length === 0 ? (
          <div className="card text-sm text-slate-500">
            Tidak ada pengajuan penghuni saat ini. Setiap kali ada penghuni baru
            mendaftar, mereka akan muncul di sini.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTenants.map((t) => (
              <PendingTenantCard
                key={t.id}
                tenant={{
                  id: t.id,
                  name: t.name,
                  email: t.email,
                  phone: t.phone,
                  ktpPhotoUrl: t.ktpPhotoUrl,
                  selfiePhotoUrl: t.selfiePhotoUrl,
                  onboardedAt: t.onboardedAt?.toISOString() ?? null,
                  createdAt: t.createdAt.toISOString(),
                }}
                kosOptions={kosOptions}
              />
            ))}
          </div>
        )}
      </section>

      {/* ===== Section: Penghuni aktif ===== */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Penghuni aktif
          {tenancies.length > 0 && (
            <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-bold text-slate-700">
              {tenancies.length}
            </span>
          )}
        </h2>
        {tenancies.length === 0 ? (
          <div className="card text-sm text-slate-500">
            Belum ada penghuni aktif. Setujui pengajuan di atas dan assign ke
            kamar untuk menambahkan penghuni.
          </div>
        ) : (
          <div className="space-y-3">
            {tenancies.map((t) => (
              <div key={t.id} className="card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex gap-3">
                    {t.tenant.selfiePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.tenant.selfiePhotoUrl}
                        alt={t.tenant.name}
                        className="h-14 w-14 rounded-full object-cover border"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-full bg-slate-200 grid place-items-center font-bold text-slate-600">
                        {t.tenant.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold">{t.tenant.name}</div>
                      <div className="text-sm text-slate-600">
                        {t.tenant.email}
                      </div>
                      {t.tenant.phone && (
                        <div className="text-xs text-slate-500">
                          {t.tenant.phone}
                        </div>
                      )}
                      <div className="text-sm text-slate-500 mt-0.5">
                        {t.room.kos.name} • Kamar {t.room.name} • Sejak{" "}
                        {new Date(t.startDate).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.tenant.ktpPhotoUrl && (
                      <a
                        href={t.tenant.ktpPhotoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary"
                      >
                        Lihat KTP
                      </a>
                    )}
                    <form action={endTenancy}>
                      <input type="hidden" name="tenancyId" value={t.id} />
                      <button
                        className="btn-danger"
                        type="submit"
                        formNoValidate
                      >
                        Akhiri sewa
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
