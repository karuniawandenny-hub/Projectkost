import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <span className="badge-yellow">Terbuka</span>;
  if (status === "IN_PROGRESS") return <span className="badge-blue">Dalam proses</span>;
  return <span className="badge-green">Selesai</span>;
}

export default async function ComplaintsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const where =
    user.role === "OWNER"
      ? { tenancy: { room: { kos: { ownerId: user.id } } } }
      : { tenancy: { tenantId: user.id } };

  const complaints = await prisma.complaint.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      tenancy: {
        include: {
          tenant: { select: { name: true } },
          room: { include: { kos: { select: { name: true } } } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Komplain</h1>
        {user.role === "TENANT" && (
          <Link href="/complaints/new" className="btn-primary">
            + Buat komplain baru
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {complaints.length === 0 && (
          <div className="card text-sm text-slate-500">
            {user.role === "TENANT"
              ? "Belum ada komplain. Klik tombol di atas untuk membuat komplain."
              : "Tidak ada komplain saat ini."}
          </div>
        )}
        {complaints.map((c) => {
          const photos: string[] = c.photoUrls ? JSON.parse(c.photoUrls) : [];
          return (
            <Link
              href={`/complaints/${c.id}`}
              key={c.id}
              className="card block hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-sm text-slate-600">
                    {user.role === "OWNER"
                      ? `${c.tenancy.tenant.name} • ${c.tenancy.room.kos.name} / Kamar ${c.tenancy.room.name}`
                      : `${c.tenancy.room.kos.name} / Kamar ${c.tenancy.room.name}`}
                  </div>
                  <p className="mt-1 text-sm text-slate-700 line-clamp-2">
                    {c.description}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={c.status} />
                  <div className="text-xs text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>
              {photos.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {photos.slice(0, 4).map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt="foto komplain"
                      className="h-16 w-16 rounded-md object-cover border"
                    />
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
