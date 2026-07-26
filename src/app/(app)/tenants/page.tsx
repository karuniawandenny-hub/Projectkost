import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import {
  approveMoveRequest,
  rejectMoveRequest,
} from "../move-request/actions";
import { PendingTenantCard, type KosOption } from "./PendingTenantCard";
import {
  ActiveTenantsView,
  type ActiveTenant,
} from "./ActiveTenantsView";

export default async function TenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageKos(user)) redirect("/dashboard");

  const [tenancies, pendingTenants, kosWithRooms, moveRequests] = await Promise.all([
    prisma.tenancy.findMany({
      where: { status: "ACTIVE", room: { kos: { ownerId: getEffectiveOwnerId(user) } } },
      include: {
        tenant: true,
        room: { include: { kos: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "TENANT", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.kos.findMany({
      where: { ownerId: getEffectiveOwnerId(user) },
      orderBy: { name: "asc" },
      include: {
        rooms: {
          where: { status: "AVAILABLE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, monthlyPrice: true },
        },
      },
    }),
    prisma.roomMoveRequest.findMany({
      where: {
        status: "PENDING",
        toRoom: { kos: { ownerId: getEffectiveOwnerId(user) } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        tenancy: { include: { tenant: { select: { name: true, email: true } } } },
        fromRoom: { include: { kos: { select: { name: true } } } },
        toRoom: { include: { kos: { select: { name: true } } } },
      },
    }),
  ]);

  const kosOptions: KosOption[] = kosWithRooms.map((k) => ({
    id: k.id,
    name: k.name,
    rooms: k.rooms,
  }));

  const activeTenants: ActiveTenant[] = tenancies.map((t) => ({
    tenancyId: t.id,
    userId: t.tenant.id,
    name: t.tenant.name,
    email: t.tenant.email,
    phone: t.tenant.phone,
    selfiePhotoUrl: t.tenant.selfiePhotoUrl,
    ktpPhotoUrl: t.tenant.ktpPhotoUrl,
    startDate: t.startDate.toISOString(),
    kosId: t.room.kos.id,
    kosName: t.room.kos.name,
    roomName: t.room.name,
    ownerSigned: !!t.ownerSignatureUrl,
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

      {/* ===== Section: Permintaan pindah kamar ===== */}
      {moveRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Permintaan pindah kamar
            <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900">
              {moveRequests.length}
            </span>
          </h2>
          <div className="space-y-3">
            {moveRequests.map((r) => (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold">
                      {r.tenancy.tenant.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.tenancy.tenant.email}
                    </div>
                    <div className="mt-2 text-sm">
                      {r.fromRoom.kos.name} • Kamar{" "}
                      <strong>{r.fromRoom.name}</strong>
                      <span className="mx-2 text-slate-400">→</span>
                      Kamar <strong>{r.toRoom.name}</strong>
                    </div>
                    {r.reason && (
                      <div className="mt-1 text-xs text-slate-600">
                        Alasan: {r.reason}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">
                      Dikirim: {new Date(r.createdAt).toLocaleString("id-ID")}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <form action={approveMoveRequest}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <button type="submit" className="btn-success">
                        Setujui pindah
                      </button>
                    </form>
                    <form action={rejectMoveRequest} className="flex gap-2">
                      <input type="hidden" name="requestId" value={r.id} />
                      <input
                        name="ownerNote"
                        className="input"
                        placeholder="Catatan (opsional)"
                      />
                      <button
                        type="submit"
                        className="btn-danger"
                        formNoValidate
                      >
                        Tolak
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
        <ActiveTenantsView tenants={activeTenants} />
      </section>
    </div>
  );
}
