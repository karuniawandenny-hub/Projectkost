import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EmptyState, ChatIcon } from "@/components/EmptyState";
import { getCurrentUser } from "@/lib/session";
import {
  OwnerComplaintsView,
  type ComplaintItem,
} from "./OwnerComplaintsView";

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <span className="badge-yellow">Terbuka</span>;
  if (status === "IN_PROGRESS")
    return <span className="badge-blue">Dalam proses</span>;
  return <span className="badge-green">Selesai</span>;
}

// Safety cap untuk owner. Data komplain lifetime bisa besar (200 penghuni
// × N komplain/tahun) — untuk sekarang muat 500 terbaru; kalau tembus,
// tambah pagination berbasis cursor. Client-side search+filter tetap
// enak sampai ~1000 rows.
const OWNER_TAKE_CAP = 500;

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export default async function ComplaintsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // ============ OWNER view (grouped + search + filter) ============
  if (user.role === "OWNER") {
    const rows = await prisma.complaint.findMany({
      where: { tenancy: { room: { kos: { ownerId: user.id } } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: OWNER_TAKE_CAP,
      include: {
        tenancy: {
          include: {
            tenant: { select: { name: true } },
            room: { include: { kos: { select: { name: true } } } },
          },
        },
      },
    });

    const items: ComplaintItem[] = rows.map((c) => {
      const photos: string[] = c.photoUrls ? JSON.parse(c.photoUrls) : [];
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        status: c.status as Status,
        createdAtISO: c.createdAt.toISOString(),
        tenantName: c.tenancy.tenant.name,
        kosName: c.tenancy.room.kos.name,
        roomName: c.tenancy.room.name,
        photoCount: photos.length,
      };
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Komplain</h1>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={<ChatIcon />}
            title="Tidak ada komplain saat ini"
            description="Komplain dari penghuni kos Anda akan muncul di sini."
          />
        ) : (
          <OwnerComplaintsView complaints={items} />
        )}
        {items.length === OWNER_TAKE_CAP && (
          <p className="text-xs text-slate-500 italic">
            Menampilkan {OWNER_TAKE_CAP} komplain terbaru. Komplain lebih lama
            tersimpan tapi tidak ditampilkan di sini.
          </p>
        )}
      </div>
    );
  }

  // ============ TENANT view (unchanged — dataset kecil) ============
  const complaints = await prisma.complaint.findMany({
    where: { tenancy: { tenantId: user.id } },
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
        <Link href="/complaints/new" className="btn-primary">
          + Buat komplain baru
        </Link>
      </div>

      <div className="space-y-3">
        {complaints.length === 0 && (
          <EmptyState
            icon={<ChatIcon />}
            title="Belum ada komplain"
            description="Laporkan kerusakan atau masalah lain agar pemilik bisa tindak lanjut."
            action={{ label: "Buat komplain", href: "/complaints/new" }}
          />
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
                    {c.tenancy.room.kos.name} / Kamar {c.tenancy.room.name}
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
