import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  PieChart,
  BarChart,
  StackedBarChart,
  PALETTE,
  type Segment,
  type StackedBarPoint,
} from "@/components/charts";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function rupiahShort(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}k`;
  return `Rp ${n}`;
}

/** Hasilkan list 6 bulan terakhir (lama -> baru), termasuk bulan sekarang. */
function lastSixMonths(): { m: number; y: number; label: string }[] {
  const now = new Date();
  const arr: { m: number; y: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({
      m: d.getMonth() + 1,
      y: d.getFullYear(),
      label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    });
  }
  return arr;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "TENANT" && !user.onboardedAt) redirect("/onboarding");

  if (user.role === "OWNER") {
    return <OwnerDashboard ownerId={user.id} name={user.name} />;
  }
  return <TenantDashboard userId={user.id} name={user.name} />;
}

/* =========================================================================
 *  OWNER DASHBOARD
 * ========================================================================= */
async function OwnerDashboard({
  ownerId,
  name,
}: {
  ownerId: string;
  name: string;
}) {
  const months = lastSixMonths();
  const earliest = new Date(months[0].y, months[0].m - 1, 1);

  const [
    kosCount,
    rooms,
    tenantsCount,
    pendingPayments,
    openComplaints,
    complaints,
    paymentsRecent,
    paymentsHistorical,
  ] = await Promise.all([
    prisma.kos.count({ where: { ownerId } }),
    prisma.room.findMany({
      where: { kos: { ownerId } },
      select: { id: true, status: true, monthlyPrice: true },
    }),
    prisma.tenancy.count({
      where: { status: "ACTIVE", room: { kos: { ownerId } } },
    }),
    prisma.payment.count({
      where: {
        status: "PENDING",
        tenancy: { room: { kos: { ownerId } } },
      },
    }),
    prisma.complaint.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        tenancy: { room: { kos: { ownerId } } },
      },
    }),
    prisma.complaint.findMany({
      where: { tenancy: { room: { kos: { ownerId } } } },
      select: { status: true },
    }),
    prisma.payment.findMany({
      where: { tenancy: { room: { kos: { ownerId } } } },
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
    prisma.payment.findMany({
      where: {
        tenancy: { room: { kos: { ownerId } } },
        // Filter pakai komposit (periodMonth, periodYear): kita ambil semuanya
        // 6 bulan terakhir dengan filter year >= earliest year saja, lalu
        // filter detail di JS.
        periodYear: { gte: earliest.getFullYear() },
      },
      select: {
        amount: true,
        status: true,
        periodMonth: true,
        periodYear: true,
      },
    }),
  ]);

  const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
  const available = rooms.length - occupied;

  /* ---------- 1) Pie: status kamar ---------- */
  const roomsPie: Segment[] = [
    { label: "Terisi", value: occupied, color: PALETTE.emerald },
    { label: "Kosong", value: available, color: PALETTE.red },
  ];

  /* ---------- 2) Bar: pendapatan masuk (VERIFIED) per bulan 6 bln ---------- */
  const incomePerMonth: Segment[] = months.map(({ m, y, label }) => {
    const sum = paymentsHistorical
      .filter((p) => p.periodMonth === m && p.periodYear === y && p.status === "VERIFIED")
      .reduce((s, p) => s + p.amount, 0);
    return { label, value: sum, color: PALETTE.emerald };
  });

  /* ---------- 3) Stacked bar: pembayaran per bulan per status ---------- */
  const paymentLegend: Segment[] = [
    { label: "Lunas", value: 0, color: PALETTE.emerald },
    { label: "Menunggu", value: 0, color: PALETTE.amber },
    { label: "Ditolak", value: 0, color: PALETTE.red },
  ];
  const paymentPerMonth: StackedBarPoint[] = months.map(({ m, y, label }) => {
    const verified = paymentsHistorical.filter(
      (p) => p.periodMonth === m && p.periodYear === y && p.status === "VERIFIED"
    ).length;
    const pending = paymentsHistorical.filter(
      (p) => p.periodMonth === m && p.periodYear === y && p.status === "PENDING"
    ).length;
    const rejected = paymentsHistorical.filter(
      (p) => p.periodMonth === m && p.periodYear === y && p.status === "REJECTED"
    ).length;
    return {
      label,
      segments: [
        { label: "Lunas", value: verified, color: PALETTE.emerald },
        { label: "Menunggu", value: pending, color: PALETTE.amber },
        { label: "Ditolak", value: rejected, color: PALETTE.red },
      ],
    };
  });

  /* ---------- 4) Pie: komplain by status ---------- */
  const cmplOpen = complaints.filter((c) => c.status === "OPEN").length;
  const cmplProgress = complaints.filter((c) => c.status === "IN_PROGRESS").length;
  const cmplResolved = complaints.filter((c) => c.status === "RESOLVED").length;
  const complaintPie: Segment[] = [
    { label: "Terbuka", value: cmplOpen, color: PALETTE.amber },
    { label: "Diproses", value: cmplProgress, color: PALETTE.blue },
    { label: "Selesai", value: cmplResolved, color: PALETTE.emerald },
  ];

  const totalIncome6m = incomePerMonth.reduce((s, x) => s + x.value, 0);
  const expectedThisMonth = rooms
    .filter((r) => r.status === "OCCUPIED")
    .reduce((s, r) => s + r.monthlyPrice, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Halo, {name.split(" ")[0]} 👋</h1>
        <p className="text-slate-600">Ringkasan bisnis kos Anda.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total kos" value={kosCount} href="/kos" />
        <Stat label="Penghuni aktif" value={tenantsCount} href="/tenants" />
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

      {/* ===== Charts row 1 ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Hunian kamar"
          subtitle={`${occupied} terisi · ${available} kosong dari ${rooms.length} kamar`}
        >
          <PieChart data={roomsPie} />
        </ChartCard>

        <ChartCard
          title="Pendapatan masuk (6 bulan terakhir)"
          subtitle={`Total ${rupiah(totalIncome6m)} · target bulan ini ${rupiah(expectedThisMonth)}`}
        >
          <BarChart data={incomePerMonth} formatValue={rupiahShort} />
        </ChartCard>
      </div>

      {/* ===== Charts row 2 ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Status pembayaran per bulan"
          subtitle="Jumlah pembayaran berdasarkan status verifikasi"
        >
          <StackedBarChart
            data={paymentPerMonth}
            legend={paymentLegend}
          />
        </ChartCard>

        <ChartCard
          title="Komplain"
          subtitle={`${cmplOpen + cmplProgress} aktif · ${cmplResolved} selesai`}
        >
          <PieChart data={complaintPie} />
        </ChartCard>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pembayaran terbaru</h2>
          <Link href="/payments" className="text-sm text-brand-700 hover:underline">
            Lihat semua
          </Link>
        </div>
        <div className="mt-3 divide-y">
          {paymentsRecent.length === 0 && (
            <div className="py-4 text-sm text-slate-500">
              Belum ada pembayaran.
            </div>
          )}
          {paymentsRecent.map((p) => (
            <div key={p.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">
                  {p.tenancy.tenant.name} — {p.tenancy.room.kos.name} /{" "}
                  {p.tenancy.room.name}
                </div>
                <div className="text-xs text-slate-500">
                  {MONTH_LABELS[p.periodMonth - 1]} {p.periodYear} • {rupiah(p.amount)}
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
  );
}

/* =========================================================================
 *  TENANT DASHBOARD
 * ========================================================================= */
async function TenantDashboard({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const months = lastSixMonths();

  const [tenancy, payments, openComplaints, complaintsForChart] = await Promise.all([
    prisma.tenancy.findFirst({
      where: { tenantId: userId, status: "ACTIVE" },
      include: { room: { include: { kos: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.payment.findMany({
      where: { tenancy: { tenantId: userId } },
      select: { amount: true, status: true, periodMonth: true, periodYear: true },
    }),
    prisma.complaint.count({
      where: {
        tenancy: { tenantId: userId },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    prisma.complaint.findMany({
      where: { tenancy: { tenantId: userId } },
      select: { status: true },
    }),
  ]);

  /* ---------- Pie: status pembayaran saya ---------- */
  const verified = payments.filter((p) => p.status === "VERIFIED").length;
  const pending = payments.filter((p) => p.status === "PENDING").length;
  const rejected = payments.filter((p) => p.status === "REJECTED").length;
  const paymentPie: Segment[] = [
    { label: "Lunas", value: verified, color: PALETTE.emerald },
    { label: "Menunggu", value: pending, color: PALETTE.amber },
    { label: "Ditolak", value: rejected, color: PALETTE.red },
  ];

  /* ---------- Stacked bar: pembayaran saya 6 bulan per status ---------- */
  const paymentLegend: Segment[] = [
    { label: "Lunas", value: 0, color: PALETTE.emerald },
    { label: "Menunggu", value: 0, color: PALETTE.amber },
    { label: "Ditolak", value: 0, color: PALETTE.red },
    { label: "Belum bayar", value: 0, color: PALETTE.slate },
  ];
  const paymentPerMonth: StackedBarPoint[] = months.map(({ m, y, label }) => {
    const p = payments.find((x) => x.periodMonth === m && x.periodYear === y);
    const segs: Segment[] = [
      { label: "Lunas", value: p?.status === "VERIFIED" ? 1 : 0, color: PALETTE.emerald },
      { label: "Menunggu", value: p?.status === "PENDING" ? 1 : 0, color: PALETTE.amber },
      { label: "Ditolak", value: p?.status === "REJECTED" ? 1 : 0, color: PALETTE.red },
      { label: "Belum bayar", value: p ? 0 : 1, color: PALETTE.slate },
    ];
    return { label, segments: segs, total: 1 };
  });

  /* ---------- Bar: nominal yang sudah saya bayar 6 bulan ---------- */
  const amountPerMonth: Segment[] = months.map(({ m, y, label }) => {
    const sum = payments
      .filter((p) => p.periodMonth === m && p.periodYear === y && p.status === "VERIFIED")
      .reduce((s, p) => s + p.amount, 0);
    return { label, value: sum, color: PALETTE.brand };
  });

  /* ---------- Pie: komplain saya ---------- */
  const cmplOpen = complaintsForChart.filter((c) => c.status === "OPEN").length;
  const cmplProgress = complaintsForChart.filter(
    (c) => c.status === "IN_PROGRESS"
  ).length;
  const cmplResolved = complaintsForChart.filter(
    (c) => c.status === "RESOLVED"
  ).length;
  const complaintPie: Segment[] = [
    { label: "Terbuka", value: cmplOpen, color: PALETTE.amber },
    { label: "Diproses", value: cmplProgress, color: PALETTE.blue },
    { label: "Selesai", value: cmplResolved, color: PALETTE.emerald },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Halo, {name.split(" ")[0]} 👋</h1>
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
          <div className="text-sm text-slate-500 mt-1">
            {tenancy.room.kos.address}
          </div>
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
        <Stat label="Pembayaran tercatat" value={payments.length} href="/payments" />
        <Link href="/payments/new" className="card hover:bg-slate-50">
          <div className="text-sm text-slate-500">Aksi cepat</div>
          <div className="mt-1 font-semibold text-brand-700">
            + Upload bukti pembayaran
          </div>
        </Link>
      </div>

      {/* ===== Charts row 1 ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Status pembayaran saya"
          subtitle={`${verified} lunas · ${pending} menunggu · ${rejected} ditolak`}
        >
          <PieChart data={paymentPie} emptyLabel="Belum ada pembayaran" />
        </ChartCard>
        <ChartCard
          title="Pembayaran 6 bulan terakhir"
          subtitle="Status pembayaran bulanan"
        >
          <StackedBarChart
            data={paymentPerMonth}
            legend={paymentLegend}
            formatValue={(n) => (n > 0 ? "✓" : "")}
          />
        </ChartCard>
      </div>

      {/* ===== Charts row 2 ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Nominal pembayaran lunas (6 bln)"
          subtitle="Total nominal yang sudah diverifikasi pemilik"
        >
          <BarChart data={amountPerMonth} formatValue={rupiahShort} />
        </ChartCard>
        <ChartCard
          title="Komplain saya"
          subtitle={`${cmplOpen + cmplProgress} aktif · ${cmplResolved} selesai`}
        >
          <PieChart data={complaintPie} emptyLabel="Belum ada komplain" />
        </ChartCard>
      </div>
    </div>
  );
}

/* =========================================================================
 *  Helper UI
 * ========================================================================= */
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && (
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
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
