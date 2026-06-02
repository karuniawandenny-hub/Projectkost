import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { approveUser, rejectUser } from "../actions";
import { EmptyState, UsersIcon } from "@/components/EmptyState";
import { getStorageStatus } from "@/lib/storage-status";

export default async function AdminDashboardPage() {
  const storage = getStorageStatus();

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
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="break-words text-xl font-bold sm:text-2xl">Dashboard Admin</h1>
        <p className="text-sm text-slate-600 sm:text-base">Ringkasan sistem.</p>
      </div>

      {!storage.persistent ? (
        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-4 text-sm">
          <div className="font-bold text-rose-800">
            ⚠️ Penyimpanan data TIDAK persisten
          </div>
          <p className="mt-1 text-rose-700">{storage.message}</p>
          <p className="mt-2 text-rose-700">
            <strong>Akibatnya:</strong> semua data (pemilik, penghuni, kos,
            pembayaran, komplain) akan <strong>hilang</strong> setiap kali
            aplikasi di-redeploy atau update program.
          </p>
          <p className="mt-2 text-rose-700">
            <strong>Cara fix di Railway:</strong> Settings → Volumes →{" "}
            <strong>+ Add Volume</strong> → Mount path:{" "}
            <code className="rounded bg-rose-100 px-1.5 py-0.5 font-mono">
              /data
            </code>{" "}
            → Size 1GB → klik Add. Railway rebuild ~3 menit, lalu data akan
            persisten otomatis.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <span className="font-semibold text-emerald-800">
            ✅ Data tersimpan aman
          </span>
          <span className="ml-2 text-emerald-700">{storage.message}</span>
        </div>
      )}

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none lg:grid-cols-4">
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
          <div className="mt-3">
            <EmptyState
              icon={<UsersIcon />}
              title="Tidak ada pengajuan menunggu"
              description="Pengajuan akun baru dari pemilik atau penghuni akan muncul di sini."
              action={{ label: "Lihat semua pengguna", href: "/admin/users" }}
            />
          </div>
        ) : (
          <div className="mt-3 divide-y">
            {recentPending.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-medium break-words">
                    {u.name}{" "}
                    <span
                      className={
                        u.role === "OWNER" ? "badge-green" : "badge-slate"
                      }
                    >
                      {u.role === "OWNER" ? "Pemilik" : "Penghuni"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 break-all">
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
  // Mobile: baris compact (label kiri, nilai kanan).
  // Desktop (sm:+): card grid seperti sebelumnya.
  const className = `flex w-full min-w-0 items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50 sm:block sm:h-full sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-5 sm:shadow-sm ${
    highlight ? "bg-amber-50 sm:border-amber-400" : ""
  }`;
  const content = (
    <>
      <div className="text-sm text-slate-600 sm:text-sm sm:text-slate-500">{label}</div>
      <div className="shrink-0 text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl">
        {value}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
