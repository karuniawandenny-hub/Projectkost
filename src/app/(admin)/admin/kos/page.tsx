import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminKosPage() {
  const kos = await prisma.kos.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { rooms: true } },
    },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Semua Kos</h1>
      <div className="space-y-2">
        {kos.length === 0 && (
          <div className="card text-sm text-slate-500">Belum ada kos terdaftar.</div>
        )}
        {kos.map((k) => (
          <div key={k.id} className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">{k.name}</div>
                <div className="text-sm text-slate-600">{k.address}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Pemilik:{" "}
                  <Link
                    href={`/admin/users/${k.owner.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {k.owner.name}
                  </Link>{" "}
                  ({k.owner.email})
                </div>
              </div>
              <div className="text-sm text-slate-600">{k._count.rooms} kamar</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
