import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { CreateRoomForm } from "./CreateRoomForm";
import { AssignTenantForm } from "./AssignTenantForm";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default async function KosDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/dashboard");

  const kos = await prisma.kos.findFirst({
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
  });
  if (!kos) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/kos" className="text-sm text-brand-700 hover:underline">
            ← Daftar kos
          </Link>
          <h1 className="text-2xl font-bold mt-1">{kos.name}</h1>
          <div className="text-sm text-slate-600">{kos.address}</div>
        </div>
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
                  {r.status === "OCCUPIED" ? (
                    <span className="badge-green">Terisi</span>
                  ) : (
                    <span className="badge-slate">Kosong</span>
                  )}
                </div>
                {active ? (
                  <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                    <span className="text-slate-500">Penghuni:</span>{" "}
                    <span className="font-medium">{active.tenant.name}</span>{" "}
                    <span className="text-slate-500">({active.tenant.email})</span>
                  </div>
                ) : (
                  <div className="mt-3">
                    <AssignTenantForm roomId={r.id} />
                  </div>
                )}
              </div>
            );
          })}
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
