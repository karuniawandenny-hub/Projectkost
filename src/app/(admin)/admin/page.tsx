import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { approveUser, rejectUser } from "../actions";

export default async function AdminDashboardPage() {
  const [
    totalUsers,
    pendingOwners,
    pendingTenants,
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
    prisma.user.count({ where: { role: "TENANT", status: "PENDING" } }),
    prisma.user.count({ where: { role: "OWNER", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TENANT", status: "ACTIVE" } }),
    prisma.kos.count(),
    prisma.room.count(),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.complaint.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.user.findMany({
      where: { role: { in: ["OWNER", "TENANT"] }, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <p className="text-slate-600">Ringkasan sistem.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Stat label="Total pengguna" value={totalUsers} href="/admin/users" />
        <Stat
          label="Pemilik menunggu approval"
          value={pendingOwners}
          highlight={pendingOwners > 0}
          href="/admin/users?role=OWNER&status=PENDING"
        />
        <Stat
          label="Penghuni menunggu approval"
          value={pendingTenants}
          highlight={pendingTenants > 0}
          href="/admin/users?role=TENANT&status=PENDING"
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
          <h2 className="font-semibold">Pengajuan akun terbaru</h2>
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
                  <div className="font-medium">
                    {u.name}{" "}
                    <span
                      className={
                        u.role === "OWNER" ? "badge-green" : "badge-slate"
                      }
                    >
                      {u.role === "OWNER" ? "Pemilik" : "Penghuni"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {u.email}
                    {u.phone ? ` • ${u.phone}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={approveUser}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn-success">
                      Setujui
                    </button>
                  </form>
                  <form action={rejectUser}>
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
    <div
      className={`h-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5 ${
        highlight ? "border-amber-400 bg-amber-50" : ""
      }`}
    >
      <div className="text-xs leading-tight text-slate-500 sm:text-sm">{label}</div>
      <div className="mt-1 text-xl font-semibold sm:text-2xl">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}
