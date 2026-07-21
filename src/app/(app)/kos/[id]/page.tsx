import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { EditKosForm } from "./EditKosForm";
import { KosRoomsView } from "./KosRoomsView";
import {
  formatDateID,
  statusBadgeClass,
  statusLabel,
  typeLabel,
} from "@/lib/maintenance";

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
      take: 100,
    }),
  ]);
  if (!kos) notFound();

  // Group maintenance by roomId untuk dilempar ke client component.
  const maintByRoomId: Record<string, MaintRow[]> = {};
  for (const m of maintenances) {
    if (!m.roomId) continue;
    if (!maintByRoomId[m.roomId]) maintByRoomId[m.roomId] = [];
    maintByRoomId[m.roomId].push({
      id: m.id,
      type: m.type,
      title: m.title,
      status: m.status,
      scheduledDate: m.scheduledDate,
      completedDate: m.completedDate,
    });
  }
  const kosLevelMaint = maintenances.filter((m) => !m.roomId);

  const tenantOptions = availableTenants.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    onboarded: !!t.onboardedAt,
  }));

  const roomsForView = kos.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    monthlyPrice: r.monthlyPrice,
    status: r.status,
    tenancies: r.tenancies.map((t) => ({
      id: t.id,
      tenant: { name: t.tenant.name, email: t.tenant.email },
    })),
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

      <KosRoomsView
        kosId={kos.id}
        rooms={roomsForView}
        tenantOptions={tenantOptions}
        maintByRoomId={maintByRoomId}
      />

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
  );
}
