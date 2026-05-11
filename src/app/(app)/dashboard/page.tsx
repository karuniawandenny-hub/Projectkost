import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

function monthName(m: number) {
  return [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ][m - 1];
}

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "TENANT" && !user.onboardedAt) redirect("/onboarding");

  if (user.role === "OWNER") {
    const [kosCount, rooms, tenants, pendingPayments, openComplaints, recentPayments] =
      await Promise.all([
        prisma.kos.count({ where: { ownerId: user.id } }),
        prisma.room.findMany({
          where: { kos: { ownerId: user.id } },
          select: { id: true, status: true },
        }),
        prisma.tenancy.count({
          where: { status: "ACTIVE", room: { kos: { ownerId: user.id } } },
        }),
        prisma.payment.count({
          where: {
            status: "PENDING",
            tenancy: { room: { kos: { ownerId: user.id } } },
          },
        }),
        prisma.complaint.count({
          where: {
            status: { in: ["OPEN", "IN_PROGRESS"] },
            tenancy: { room: { kos: { ownerId: user.id } } },
          },
        }),
        prisma.payment.findMany({
          where: { tenancy: { room: { kos: { ownerId: user.id } } } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            tenancy: {
              include: {
                tenant: { select: { name: true } },
                room: { include: { kos: { select: { name: true } } } },
              },
            },
          },
        }),
      ]);
    const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
    const available = rooms.length - occupied;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Halo, {user.name.split(" ")[0]} 👋</h1>
          <p className="text-slate-600">Ringkasan bisnis kos Anda.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total kos" value={kosCount} href="/kos" />
          <Stat label="Penghuni aktif" value={tenants} href="/tenants" />
          <Stat
            label="Kamar (terisi / kosong)"
            value={`${occupied} / ${available}`}
            href="/kos"
          />
          <Stat
            label="Pembayaran perlu verifikasi"
            value={pendingPayments}
            highlight={pendingPayments > 0}
            href="/payments"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Pembayaran terbaru</h2>
              <Link href="/payments" className="text-sm text-brand-700 hover:underline">
                Lihat semua
              </Link>
            </div>
            <div className="mt-3 divide-y">
              {recentPayments.length === 0 && (
                <div className="py-4 text-sm text-slate-500">
                  Belum ada pembayaran.
                </div>
              )}
              {recentPayments.map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {p.tenancy.tenant.name} — {p.tenancy.room.kos.name} /{" "}
                      {p.tenancy.room.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {monthName(p.periodMonth)} {p.periodYear} • {rupiah(p.amount)}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Komplain perlu ditangani</h2>
              <Link href="/complaints" className="text-sm text-brand-700 hover:underline">
                Lihat semua
              </Link>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {openComplaints === 0
                ? "Tidak ada komplain terbuka 🎉"
                : `${openComplaints} komplain butuh perhatian Anda.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // TENANT dashboard
  const tenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, status: "ACTIVE" },
    include: { room: { include: { kos: true } } },
    orderBy: { startDate: "desc" },
  });

  const [payments, openComplaints] = await Promise.all([
    prisma.payment.findMany({
      where: { tenancy: { tenantId: user.id } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      take: 4,
    }),
    prisma.complaint.count({
      where: {
        tenancy: { tenantId: user.id },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Halo, {user.name.split(" ")[0]} 👋</h1>
        <p className="text-slate-600">Selamat datang di Kelola Kos.</p>
      </div>

      {tenancy ? (
        <div className="card">
          <div className="text-sm text-slate-500">Kos & kamar Anda</div>
          <div className="mt-1 text-lg font-semibold">{tenancy.room.kos.name}</div>
          <div className="text-sm text-slate-600">
            Kamar <span className="font-medium">{tenancy.room.name}</span> •{" "}
            {rupiah(tenancy.room.monthlyPrice)}/bulan
          </div>
          <div className="text-sm text-slate-500 mt-1">{tenancy.room.kos.address}</div>
        </div>
      ) : (
        <div className="card border-amber-300 bg-amber-50">
          <div className="font-medium text-amber-800">
            Anda belum di-assign ke kamar manapun.
          </div>
          <p className="mt-1 text-sm text-amber-800/80">
            Hubungi pemilik kos Anda agar ditambahkan ke kamar Anda.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Komplain terbuka" value={openComplaints} href="/complaints" />
        <Stat
          label="Pembayaran tercatat"
          value={payments.length}
          href="/payments"
        />
        <Link href="/payments/new" className="card hover:bg-slate-50">
          <div className="text-sm text-slate-500">Aksi cepat</div>
          <div className="mt-1 font-semibold text-brand-700">
            + Upload bukti pembayaran
          </div>
        </Link>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pembayaran terakhir</h2>
          <Link href="/payments" className="text-sm text-brand-700 hover:underline">
            Lihat semua
          </Link>
        </div>
        <div className="mt-3 divide-y">
          {payments.length === 0 && (
            <div className="py-4 text-sm text-slate-500">Belum ada pembayaran.</div>
          )}
          {payments.map((p) => (
            <div key={p.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">
                  {monthName(p.periodMonth)} {p.periodYear}
                </div>
                <div className="text-xs text-slate-500">{rupiah(p.amount)}</div>
              </div>
              <StatusBadge status={p.status} />
            </div>
          ))}
        </div>
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

function StatusBadge({ status }: { status: string }) {
  if (status === "PENDING") return <span className="badge-yellow">Menunggu</span>;
  if (status === "VERIFIED") return <span className="badge-green">Lunas</span>;
  return <span className="badge-red">Ditolak</span>;
}
