import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { CreateRoomForm } from "./CreateRoomForm";
import { AssignTenantForm } from "./AssignTenantForm";
import { EditKosForm } from "./EditKosForm";
import { EditRoomForm } from "./EditRoomForm";
import {
  formatDateID,
  statusBadgeClass,
  statusLabel,
  typeLabel,
} from "@/lib/maintenance";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

type MaintRow = {
  id: string;
  type: string;
  title: string;
  status: string;
  scheduledDate: Date;
  completedDate: Date | null;
};

function MaintenanceRow({ m }: { m: MaintRow }) {
  return (
    <Link
      href={`/maintenance/${m.id}`}
      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-100"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`badge text-[10px] ${m.type === "PREVENTIVE" ? "badge-blue" : "badge-violet"}`}>
            {typeLabel(m.type)}
          </span>
          <span className={`badge text-[10px] ${statusBadgeClass(m.status)}`}>
            {statusLabel(m.status)}
          </span>
        </div>
        <div className="mt-0.5 truncate font-medium text-slate-700">
          {m.title}
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-slate-500">
        {m.completedDate ? formatDateID(m.completedDate) : formatDateID(m.scheduledDate)}
      </div>
    </Link>
  );
}

function RoomMaintenanceHistory({ items }: { items: MaintRow[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="px-1 py-0.5 text-xs font-semibold text-slate-500">
        Riwayat perawatan ({items.length})
      </div>
      <div className="mt-1 space-y-0.5">
        {items.slice(0, 5).map((m) => (
          <MaintenanceRow key={m.id} m={m} />
        ))}
        {items.length > 5 && (
          <Link
            href={`/maintenance?kosId=${items[0] ? "" : ""}`}
            className="block px-2 py-1 text-[11px] text-brand-700 hover:underline"
          >
            +{items.length - 5} lagi → buka menu Perawatan
          </Link>
        )}
      </div>
    </div>
  );
}

export default async function KosDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/dashboard");

  const [kos, availableTenants, maintenances] = await Promise.all([
    prisma.kos.findFirst({
      where: { id: params.id, ownerId: user.id },
      include: {
        rooms: {
          orderBy: { createdAt: "asc" },
          include: {
            tenancies: {
              where: { status: "ACTIVE" },
              include: { tenant: { select: { name: true, email: true } } },
            },
          },
        },
      },
    }),
    // Penghuni siap di-assign:
    //   - role TENANT, status ACTIVE
    //   - belum punya tenancy aktif
    prisma.user.findMany({
      where: {
        role: "TENANT",
        status: "ACTIVE",
        tenancies: { none: { status: "ACTIVE" } },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        onboardedAt: true,
      },
    }),
    prisma.maintenance.findMany({
      where: { kosId: params.id },
      orderBy: [{ status: "asc" }, { scheduledDate: "desc" }],
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        roomId: true,
        scheduledDate: true,
        completedDate: true,
        cost: true,
      },
      take: 50,
    }),
  ]);
  if (!kos) notFound();

  // Group maintenance by roomId untuk render di kartu kamar.
  const maintByRoom = new Map<string, typeof maintenances>();
  for (const m of maintenances) {
    if (!m.roomId) continue;
    const arr = maintByRoom.get(m.roomId) ?? [];
    arr.push(m);
    maintByRoom.set(m.roomId, arr);
  }
  const kosLevelMaint = maintenances.filter((m) => !m.roomId);

  const tenantOptions = availableTenants.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    onboarded: !!t.onboardedAt,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/kos" className="text-sm text-brand-700 hover:underline">
            ← Daftar kos
          </Link>
          <h1 className="text-2xl font-bold mt-1">{kos.name}</h1>
          <div className="text-sm text-slate-600">{kos.address}</div>
          {kos.description && (
            <div className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">
              {kos.description}
            </div>
          )}
        </div>
        <EditKosForm
          kos={{
            id: kos.id,
            name: kos.name,
            address: kos.address,
            description: kos.description,
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-semibold">Daftar kamar</h2>
          {kos.rooms.length === 0 && (
            <div className="card text-sm text-slate-500">
              Belum ada kamar. Tambahkan kamar pertama.
            </div>
          )}
          {kos.rooms.map((r) => {
            const active = r.tenancies[0];
            return (
              <div key={r.id} className="card">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold">Kamar {r.name}</div>
                    <div className="text-sm text-slate-600">
                      {rupiah(r.monthlyPrice)} / bulan
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.status === "OCCUPIED" ? (
                      <span className="badge-green">Terisi</span>
                    ) : (
                      <span className="badge-slate">Kosong</span>
                    )}
                    <EditRoomForm
                      room={{ id: r.id, name: r.name, monthlyPrice: r.monthlyPrice }}
                    />
                  </div>
                </div>
                {active ? (
                  <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                    <span className="text-slate-500">Penghuni:</span>{" "}
                    <span className="font-medium">{active.tenant.name}</span>{" "}
                    <span className="text-slate-500">({active.tenant.email})</span>
                  </div>
                ) : (
                  <div className="mt-3">
                    <AssignTenantForm roomId={r.id} tenants={tenantOptions} />
                  </div>
                )}
                <RoomMaintenanceHistory items={maintByRoom.get(r.id) ?? []} />
              </div>
            );
          })}

          {kosLevelMaint.length > 0 && (
            <div className="card">
              <h3 className="font-semibold">Perawatan fasilitas kos</h3>
              <p className="text-xs text-slate-500">
                Perawatan yang tidak terikat ke kamar tertentu (pompa, taman, dll).
              </p>
              <div className="mt-3 space-y-1.5">
                {kosLevelMaint.map((m) => (
                  <MaintenanceRow key={m.id} m={m} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2 className="font-semibold">Tambah kamar</h2>
            <div className="mt-3">
              <CreateRoomForm kosId={kos.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
