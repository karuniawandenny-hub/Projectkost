import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { MissingPhoneBanner } from "../MissingPhoneBanner";
import {
  PieChart,
  BarChart,
  StackedBarChart,
  MonthStatusTimeline,
  PALETTE,
  type Segment,
  type StackedBarPoint,
  type MonthStatusItem,
} from "@/components/charts";
import {
  billingSnapshot,
  formatDateID,
  anniversaryInMonth,
  ensureBillsForUser,
} from "@/lib/billing";

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

  // Lazy auto-generate tagihan bulanan saat dashboard di-load.
  // Idempoten (skip kalau sudah ada). Tidak blocking — kalau gagal,
  // dashboard tetap render.
  try {
    await ensureBillsForUser(user.id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("ensureBillsForUser error:", e);
  }

  if (user.role === "OWNER") {
    return <OwnerDashboard ownerId={user.id} name={user.name} phone={user.phone} />;
  }
  return <TenantDashboard userId={user.id} name={user.name} phone={user.phone} />;
}

/* =========================================================================
 *  OWNER DASHBOARD
 * ========================================================================= */
async function OwnerDashboard({
  ownerId,
  name,
  phone,
}: {
  ownerId: string;
  name: string;
  phone: string | null;
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
    unsignedContracts,
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
    // Kontrak tenancy ACTIVE yang owner belum tandatangan. Dipakai untuk
    // call-to-action di dashboard supaya kontrak tidak terlupa.
    prisma.tenancy.findMany({
      where: {
        status: "ACTIVE",
        room: { kos: { ownerId } },
        ownerSignatureUrl: null,
      },
      orderBy: { startDate: "desc" },
      take: 6,
      select: {
        id: true,
        startDate: true,
        tenant: { select: { name: true } },
        room: {
          select: { name: true, kos: { select: { name: true } } },
        },
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

      {!phone && <MissingPhoneBanner />}

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none lg:grid-cols-4">
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

      {unsignedContracts.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/50">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-amber-900">
                📄 Kontrak menunggu tanda tangan Anda
              </h2>
              <p className="mt-0.5 text-sm text-amber-800">
                {unsignedContracts.length} kontrak penghuni aktif belum Anda
                tandatangani sebagai PIHAK PERTAMA. Tanda tangan elektronik
                sekali untuk membuat kwitansi pembayaran tampil resmi.
              </p>
            </div>
          </div>
          <div className="mt-3 divide-y divide-amber-200">
            {unsignedContracts.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{t.tenant.name}</div>
                  <div className="text-xs text-amber-800">
                    {t.room.kos.name} · Kamar {t.room.name} · mulai{" "}
                    {t.startDate.toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <Link
                  href={`/tenancies/${t.id}/contract`}
                  className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
                >
                  Tandatangani →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

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
  phone,
}: {
  userId: string;
  name: string;
  phone: string | null;
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

  // Perawatan aktif (SCHEDULED / IN_PROGRESS) untuk kamar tenant.
  // Ditampilkan sebagai card di dashboard supaya tenant tidak perlu
  // mengandalkan notifikasi saja — saat buka aplikasi langsung lihat.
  // Query bergantung pada tenancy: kalau belum punya, skip.
  const upcomingMaintenance = tenancy
    ? await prisma.maintenance.findMany({
        where: {
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          OR: [
            { roomId: tenancy.room.id },
            { roomId: null, kosId: tenancy.room.kos.id },
          ],
        },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          scheduledDate: true,
          room: { select: { name: true } },
        },
        orderBy: [{ status: "asc" }, { scheduledDate: "asc" }],
        take: 3,
      })
    : [];

  /* ---------- Chart 1: jadwal pembayaran 6 bulan SEJAK tenant masuk ---------- */
  //  - Bulan-bulan yang ditampilkan: 6 bulan berurutan mulai dari bulan
  //    yang lebih besar antara Tenancy.startDate dan Tenancy.createdAt
  //    (= saat owner meng-assign & menyetujui). Pakai createdAt sebagai
  //    floor agar chart tidak menampilkan periode SEBELUM owner approve
  //    walaupun startDate di-input lebih awal (mis. default 'hari ini'
  //    yang ternyata bulan sebelumnya, atau backdate).
  //  - Jatuh tempo tiap bulan = anniversary day di bulan tersebut.
  //  - Status:
  //      * VERIFIED/PENDING/REJECTED jika ada Payment record untuk periode itu
  //      * UNPAID jika periode sudah lewat jatuh tempo & belum ada payment
  //      * UPCOMING jika periode belum sampai jatuh tempo
  const today = new Date();
  const seed = tenancy
    ? new Date(
        Math.max(
          new Date(tenancy.startDate).getTime(),
          new Date(tenancy.createdAt).getTime()
        )
      )
    : new Date();
  const baseYear = seed.getFullYear();
  const baseMonth = seed.getMonth();

  const paymentTimeline: MonthStatusItem[] = Array.from({ length: 6 }).map(
    (_, i) => {
      const y = baseYear + Math.floor((baseMonth + i) / 12);
      const m0 = (baseMonth + i) % 12; // 0-11
      const m = m0 + 1; // 1-12
      const label = `${MONTH_LABELS[m0]} ${String(y).slice(2)}`;
      const due = tenancy
        ? anniversaryInMonth(new Date(tenancy.startDate), y, m0)
        : new Date(y, m0, 1);
      const p = payments.find((x) => x.periodMonth === m && x.periodYear === y);
      let status: MonthStatusItem["status"];
      if (p) {
        status = p.status as "VERIFIED" | "PENDING" | "REJECTED";
      } else if (due.getTime() > today.getTime()) {
        status = "UPCOMING";
      } else {
        status = "UNPAID";
      }
      const dueLabel = due.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
      });
      return { label, status, amount: p?.amount ?? null, dueLabel };
    }
  );

  const verifiedTL = paymentTimeline.filter((x) => x.status === "VERIFIED").length;
  const pendingTL = paymentTimeline.filter((x) => x.status === "PENDING").length;
  const rejectedTL = paymentTimeline.filter((x) => x.status === "REJECTED").length;
  const unpaidTL = paymentTimeline.filter((x) => x.status === "UNPAID").length;
  const upcomingTL = paymentTimeline.filter((x) => x.status === "UPCOMING").length;
  const totalPaidTL = paymentTimeline
    .filter((x) => x.status === "VERIFIED")
    .reduce((s, x) => s + (x.amount ?? 0), 0);

  /* ---------- Chart 2: pie komplain saya ---------- */
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
        <h1 className="break-words text-xl font-bold sm:text-2xl">Halo, {name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-slate-600 sm:text-base">Selamat datang di Kos Baiti.</p>
      </div>

      {!phone && <MissingPhoneBanner />}

      {tenancy ? (
        <>
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
            <div className="text-xs text-slate-500 mt-2">
              Mulai sewa:{" "}
              <span className="font-medium text-slate-700">
                {formatDateID(tenancy.startDate)}
              </span>
            </div>
            <div className="mt-3">
              <a
                href={`/tenancies/${tenancy.id}/contract`}
                className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
              >
                📄 Lihat / cetak kontrak sewa
              </a>
            </div>
          </div>
          <BillingCard tenancy={tenancy} payments={payments} />
          {upcomingMaintenance.length > 0 && (
            <MaintenanceCard items={upcomingMaintenance} />
          )}
        </>
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

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid sm:grid-cols-3 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none">
        <Stat label="Komplain terbuka" value={openComplaints} href="/complaints" />
        <Stat label="Pembayaran tercatat" value={payments.length} href="/payments" />
        <Link
          href="/payments/new"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50 sm:block sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-5 sm:shadow-sm"
        >
          <div className="text-sm text-slate-500">Aksi cepat</div>
          <div className="font-semibold text-brand-700 sm:mt-1">
            + Upload bukti pembayaran
          </div>
        </Link>
      </div>

      {/* ===== 2 chart utama ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Jadwal pembayaran 6 bulan sejak masuk"
          subtitle={
            tenancy
              ? `${verifiedTL} lunas · ${pendingTL} menunggu · ${rejectedTL} ditolak · ${unpaidTL} belum bayar · ${upcomingTL} akan datang — total masuk ${rupiah(totalPaidTL)}`
              : "Belum ada tenancy aktif"
          }
        >
          <MonthStatusTimeline
            data={paymentTimeline}
            emptyLabel="Belum ada tenancy aktif"
          />
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
  const className = `flex w-full min-w-0 items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50 sm:block sm:h-full sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-5 sm:shadow-sm ${
    highlight ? "bg-amber-50 sm:border-amber-400" : ""
  }`;
  const content = (
    <>
      <div className="text-sm text-slate-600 sm:text-slate-500">{label}</div>
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

function StatusBadge({ status }: { status: string }) {
  if (status === "PENDING") return <span className="badge-yellow">Menunggu</span>;
  if (status === "VERIFIED") return <span className="badge-green">Lunas</span>;
  return <span className="badge-red">Ditolak</span>;
}

/**
 * Kartu informasi pembayaran untuk dashboard penghuni.
 * Menghitung status periode saat ini (dari startDate) dan jatuh tempo
 * periode berikutnya. Banner pengingat muncul saat ada tagihan belum
 * dibayar / lewat jatuh tempo.
 */
function BillingCard({
  tenancy,
  payments,
}: {
  tenancy: { startDate: Date };
  payments: { status: string; periodMonth: number; periodYear: number }[];
}) {
  const snap = billingSnapshot(tenancy.startDate);
  const currentPayment = snap.current
    ? payments.find(
        (p) =>
          p.periodMonth === snap.current!.month &&
          p.periodYear === snap.current!.year
      )
    : null;
  const nextPayment = payments.find(
    (p) => p.periodMonth === snap.next.month && p.periodYear === snap.next.year
  );

  // Banner pengingat: TERLAMBAT bayar untuk periode current (kalau ada,
  // belum punya record VERIFIED), atau dekat jatuh tempo (≤7 hari) tanpa
  // upload bukti.
  const showBanner =
    !!snap.current &&
    snap.current.isLate &&
    (!currentPayment || currentPayment.status !== "VERIFIED");

  const monthLabel = (m: number) => MONTH_LABELS[m - 1];

  return (
    <>
      {showBanner && snap.current && (
        <div className="card border-red-300 bg-red-50">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-700">
              !
            </div>
            <div className="flex-1">
              <div className="font-semibold text-red-800">
                Tagihan periode {monthLabel(snap.current.month)} {snap.current.year}{" "}
                terlambat {snap.current.daysLate} hari
              </div>
              <p className="mt-1 text-sm text-red-800/90">
                Jatuh tempo {formatDateID(snap.current.dueDate)}.{" "}
                {currentPayment
                  ? currentPayment.status === "PENDING"
                    ? "Bukti pembayaran Anda menunggu verifikasi pemilik."
                    : "Pembayaran Anda ditolak, silakan upload ulang."
                  : "Segera upload bukti pembayaran."}
              </p>
            </div>
            <Link href="/payments/new" className="btn-danger no-print">
              Upload bukti
            </Link>
          </div>
        </div>
      )}

      <div className="card">
        <div className="text-sm text-slate-500">Informasi pembayaran</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-slate-500">Periode saat ini</div>
            {snap.current ? (
              <>
                <div className="mt-0.5 font-semibold">
                  {monthLabel(snap.current.month)} {snap.current.year}
                </div>
                <div className="text-xs text-slate-500">
                  Jatuh tempo: {formatDateID(snap.current.dueDate)}
                </div>
                <div className="mt-1">
                  {currentPayment ? (
                    <StatusBadge status={currentPayment.status} />
                  ) : snap.current.isLate ? (
                    <span className="badge-red">
                      Terlambat {snap.current.daysLate} hari
                    </span>
                  ) : (
                    <span className="badge-yellow">Belum dibayar</span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-0.5 text-sm text-slate-500">
                Belum ada periode tagihan aktif.
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-slate-500">Jatuh tempo berikutnya</div>
            <div className="mt-0.5 font-semibold">
              {formatDateID(snap.next.dueDate)}
            </div>
            <div className="text-xs text-slate-500">
              {snap.next.daysUntil > 0
                ? `${snap.next.daysUntil} hari lagi`
                : snap.next.daysUntil === 0
                  ? "Hari ini"
                  : "Sudah lewat"}{" "}
              · Periode {monthLabel(snap.next.month)} {snap.next.year}
            </div>
            <div className="mt-1">
              {nextPayment ? (
                <StatusBadge status={nextPayment.status} />
              ) : (
                <span className="badge-slate">Belum dibayar</span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Tagihan jatuh tempo setiap tanggal{" "}
          <span className="font-medium text-slate-700">
            {snap.anniversaryDay}
          </span>{" "}
          tiap bulan (mengikuti tanggal mulai sewa).
        </p>
      </div>
    </>
  );
}

/**
 * Kartu ringkas jadwal/proses perawatan untuk dashboard penghuni.
 * Hanya tampil kalau ada perawatan dengan status SCHEDULED atau
 * IN_PROGRESS yang menyangkut kamar tenant atau fasilitas kos-nya.
 * Detail penuh ada di /maintenance dan /maintenance/[id].
 */
function MaintenanceCard({
  items,
}: {
  items: {
    id: string;
    title: string;
    type: string;
    status: string;
    scheduledDate: Date;
    room: { name: string } | null;
  }[];
}) {
  return (
    <div className="card border-amber-200 bg-amber-50/40">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-amber-900">🛠️ Perawatan kamar Anda</h2>
        <Link
          href="/maintenance"
          className="text-sm text-brand-700 hover:underline"
        >
          Lihat semua
        </Link>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((m) => {
          const isInProgress = m.status === "IN_PROGRESS";
          const typeLabelText =
            m.type === "PREVENTIVE" ? "Preventif" : "Korektif";
          return (
            <Link
              key={m.id}
              href={`/maintenance/${m.id}`}
              className="block rounded-lg border border-amber-200 bg-white p-3 transition hover:bg-amber-50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-blue">{typeLabelText}</span>
                <span
                  className={
                    isInProgress
                      ? "badge bg-emerald-100 text-emerald-800"
                      : "badge bg-amber-100 text-amber-800"
                  }
                >
                  {isInProgress ? "Sedang berlangsung" : "Terjadwal"}
                </span>
              </div>
              <div className="mt-1.5 font-medium">{m.title}</div>
              <div className="text-xs text-slate-600">
                {m.room ? `Kamar ${m.room.name}` : "Fasilitas kos"} •{" "}
                {isInProgress
                  ? `Mulai ${formatDateID(m.scheduledDate)}`
                  : `Jadwal ${formatDateID(m.scheduledDate)}`}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
