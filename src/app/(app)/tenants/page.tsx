import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { viewerUrl } from "@/lib/viewer";
import { endTenancy } from "../kos/actions";
import {
  approveMoveRequest,
  rejectMoveRequest,
} from "../move-request/actions";
import { PendingTenantCard, type KosOption } from "./PendingTenantCard";
import { EditStartDateForm } from "./EditStartDateForm";
import { DeleteTenantButton } from "./DeleteTenantButton";

export default async function TenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/dashboard");

  const [tenancies, pendingTenants, kosWithRooms, moveRequests] = await Promise.all([
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
    prisma.roomMoveRequest.findMany({
      where: {
        status: "PENDING",
        toRoom: { kos: { ownerId: user.id } },
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
                  <div className="flex flex-wrap items-center gap-2">
                    {t.tenant.ktpPhotoUrl && (
                      <a
                        href={viewerUrl(t.tenant.ktpPhotoUrl, "Foto KTP")}
                        className="btn-secondary"
                      >
                        Lihat KTP
                      </a>
                    )}
                    <a
                      href={`/tenancies/${t.id}/contract`}
                      className="btn-secondary"
                    >
                      📄 Kontrak
                    </a>
                    <EditStartDateForm
                      tenancyId={t.id}
                      currentStartDate={t.startDate.toISOString()}
                    />
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
                    <DeleteTenantButton
                      userId={t.tenant.id}
                      tenantName={t.tenant.name}
                      buttonLabel="Hapus penghuni"
                    />
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
