import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { PendingTenantCard } from "./PendingTenantCard";

export default async function PendingTenantsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "OWNER") redirect("/dashboard");

  // Daftar calon penghuni: status PENDING, role TENANT.
  const pending = await prisma.user.findMany({
    where: { role: "TENANT", status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  // Daftar kamar kosong milik owner — untuk dropdown assign.
  const availableRooms = await prisma.room.findMany({
    where: { status: "AVAILABLE", kos: { ownerId: me.id } },
    include: { kos: { select: { name: true } } },
    orderBy: [{ kos: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tenants" className="text-sm text-brand-700 hover:underline">
          ← Penghuni aktif
        </Link>
        <h1 className="text-2xl font-bold mt-1">Calon penghuni (menunggu approval)</h1>
        <p className="text-sm text-slate-600">
          Tinjau data calon penghuni. Anda bisa langsung menyetujui & menempatkan
          mereka ke kamar yang tersedia, atau menyetujui dulu lalu assign nanti.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Tidak ada pengajuan menunggu saat ini.
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((t) => (
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
              rooms={availableRooms.map((r) => ({
                id: r.id,
                label: `${r.kos.name} • Kamar ${r.name} (Rp ${r.monthlyPrice.toLocaleString("id-ID")})`,
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
