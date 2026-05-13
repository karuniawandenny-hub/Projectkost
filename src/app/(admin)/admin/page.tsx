import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { approveOwner, rejectOwner } from "../actions";

export default async function AdminDashboardPage() {
  const [
    totalUsers,
    pendingOwners,
    activeOwners,
    activeTenants,
    totalKos,
    totalRooms,
    pendingPayments,
    openComplaints,
    recentPending,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "OWNER", status: "PENDING" } }),
    prisma.user.count({ where: { role: "OWNER", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TENANT", status: "ACTIVE" } }),
    prisma.kos.count(),
    prisma.room.count(),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.complaint.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.user.findMany({
      where: { role: "OWNER", status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <p className="text-slate-600">Ringkasan sistem.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total pengguna" value={totalUsers} href="/admin/users" />
        <Stat
          label="Pemilik menunggu approval"
          value={pendingOwners}
          highlight={pendingOwners > 0}
          href="/admin/users?status=PENDING"
        />
        <Stat label="Pemilik aktif" value={activeOwners} />
        <Stat label="Penghuni aktif" value={activeTenants} />
        <Stat label="Total kos" value={totalKos} href="/admin/kos" />
        <Stat label="Total kamar" value={totalRooms} />
        <Stat
          label="Pembayaran menunggu verifikasi"
          value={pendingPayments}
          href="/admin/payments"
        />
        <Stat
          label="Komplain aktif"
          value={openComplaints}
          href="/admin/complaints"
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pengajuan pemilik terbaru</h2>
          <Link href="/admin/users?status=PENDING" className="text-sm text-brand-700 hover:underline">
            Lihat semua
          </Link>
        </div>
        {recentPending.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Tidak ada pengajuan menunggu.
          </p>
        ) : (
          <div className="mt-3 divide-y">
            {recentPending.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-slate-500">
                    {u.email}
                    {u.phone ? ` • ${u.phone}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={approveOwner}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn-success">
                      Setujui
                    </button>
                  </form>
                  <form action={rejectOwner}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn-danger">
                      Tolak
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: string | number;
  href?: string;
  highlight?: boolean;
}) {
  const inner = (
    <div className={`card h-full ${highlight ? "border-amber-400 bg-amber-50" : ""}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
