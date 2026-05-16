import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { cancelMoveRequest } from "./actions";
import { MoveRequestForm } from "./MoveRequestForm";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function StatusBadge({ s }: { s: string }) {
  if (s === "PENDING") return <span className="badge-yellow">Menunggu pemilik</span>;
  if (s === "APPROVED") return <span className="badge-green">Disetujui</span>;
  return <span className="badge-red">Ditolak / dibatalkan</span>;
}

export default async function MoveRequestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TENANT") redirect("/dashboard");

  const tenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, status: "ACTIVE" },
    include: { room: { include: { kos: true } } },
  });

  if (!tenancy) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold">Pindah kamar</h1>
        <p className="mt-2 text-sm text-slate-600">
          Anda belum di-assign ke kamar manapun. Fitur pindah kamar tersedia
          setelah Anda menempati salah satu kamar.
        </p>
        <Link href="/dashboard" className="btn-secondary mt-4 inline-flex">
          Kembali
        </Link>
      </div>
    );
  }

  // Kamar kosong di kos yang sama
  const availableRooms = await prisma.room.findMany({
    where: { kosId: tenancy.room.kosId, status: "AVAILABLE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, monthlyPrice: true },
  });

  // Riwayat & permintaan aktif
  const requests = await prisma.roomMoveRequest.findMany({
    where: { tenancyId: tenancy.id },
    orderBy: { createdAt: "desc" },
    include: {
      fromRoom: { select: { name: true } },
      toRoom: { select: { name: true } },
    },
    take: 10,
  });
  const pending = requests.find((r) => r.status === "PENDING") ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pindah kamar</h1>
        <p className="text-slate-600">
          Ajukan pindah ke kamar kosong di{" "}
          <span className="font-medium">{tenancy.room.kos.name}</span>. Setelah
          pemilik menyetujui, sistem akan otomatis memindahkan Anda dan
          memperbarui status kedua kamar.
        </p>
      </div>

      <div className="card">
        <div className="text-sm text-slate-500">Kamar Anda saat ini</div>
        <div className="mt-1 text-lg font-semibold">
          {tenancy.room.kos.name} • Kamar {tenancy.room.name}
        </div>
        <div className="text-sm text-slate-600">
          {rupiah(tenancy.room.monthlyPrice)} / bulan
        </div>
      </div>

      {pending ? (
        <div className="card border-amber-300 bg-amber-50/40">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm text-amber-800 font-semibold">
                Permintaan pindah Anda sedang ditinjau pemilik
              </div>
              <div className="mt-1 text-sm">
                Dari <strong>Kamar {pending.fromRoom.name}</strong> → ke{" "}
                <strong>Kamar {pending.toRoom.name}</strong>
              </div>
              {pending.reason && (
                <div className="mt-1 text-xs text-slate-600">
                  Alasan: {pending.reason}
                </div>
              )}
              <div className="text-xs text-slate-500 mt-1">
                Dikirim:{" "}
                {new Date(pending.createdAt).toLocaleString("id-ID")}
              </div>
            </div>
            <form action={cancelMoveRequest}>
              <input type="hidden" name="requestId" value={pending.id} />
              <button type="submit" className="btn-secondary">
                Batalkan permintaan
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2 className="font-semibold">Ajukan pindah ke kamar lain</h2>
          <p className="text-sm text-slate-600 mt-1">
            Hanya kamar kosong di kos yang sama yang bisa dipilih.
          </p>
          <div className="mt-4">
            <MoveRequestForm
              rooms={availableRooms.map((r) => ({
                id: r.id,
                label: `Kamar ${r.name} — ${rupiah(r.monthlyPrice)}/bulan`,
              }))}
            />
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold">Riwayat permintaan pindah</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Belum ada permintaan.</p>
        ) : (
          <div className="mt-3 divide-y">
            {requests.map((r) => (
              <div key={r.id} className="py-3 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm">
                    Kamar <strong>{r.fromRoom.name}</strong> → Kamar{" "}
                    <strong>{r.toRoom.name}</strong>
                  </div>
                  {r.reason && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Alasan: {r.reason}
                    </div>
                  )}
                  {r.ownerNote && r.status !== "APPROVED" && (
                    <div className="text-xs text-slate-700 mt-0.5">
                      Catatan pemilik: {r.ownerNote}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-0.5">
                    {new Date(r.createdAt).toLocaleString("id-ID")}
                    {r.decidedAt && (
                      <>
                        {" "}
                        • diputuskan{" "}
                        {new Date(r.decidedAt).toLocaleString("id-ID")}
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge s={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
