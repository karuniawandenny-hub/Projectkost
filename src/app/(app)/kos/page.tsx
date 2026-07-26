import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { CreateKosForm } from "./CreateKosForm";

export default async function KosListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageKos(user)) redirect("/dashboard");

  const kosList = await prisma.kos.findMany({
    where: { ownerId: getEffectiveOwnerId(user) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { rooms: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kos & Kamar</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {kosList.length === 0 && (
            <div className="card text-sm text-slate-500">
              Belum ada kos. Tambahkan kos pertama Anda di sebelah kanan.
            </div>
          )}
          {kosList.map((k) => (
            <Link
              href={`/kos/${k.id}`}
              key={k.id}
              className="card flex items-center justify-between hover:bg-slate-50"
            >
              <div>
                <div className="font-semibold">{k.name}</div>
                <div className="text-sm text-slate-600">{k.address}</div>
              </div>
              <div className="text-sm text-slate-600">
                {k._count.rooms} kamar →
              </div>
            </Link>
          ))}
        </div>

        <div>
          <div className="card">
            <h2 className="font-semibold">Tambah kos baru</h2>
            <div className="mt-3">
              <CreateKosForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
