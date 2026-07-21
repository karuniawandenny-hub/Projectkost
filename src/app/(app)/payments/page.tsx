import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EmptyState, PaymentIcon } from "@/components/EmptyState";
import { getCurrentUser } from "@/lib/session";
import { viewerUrl } from "@/lib/viewer";
import { OwnerPaymentsView, type PaymentItem } from "./OwnerPaymentsView";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
const MONTHS = [
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
];

function StatusBadge({ status }: { status: string }) {
  if (status === "DUE") return <span className="badge-slate">Belum dibayar</span>;
  if (status === "PENDING") return <span className="badge-yellow">Bukti diajukan, menunggu verifikasi</span>;
  if (status === "VERIFIED") return <span className="badge-green">Lunas</span>;
  return <span className="badge-red">Ditolak</span>;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: { uploaded?: string; month?: string; year?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const justUploadedId = searchParams?.uploaded;
  // Lazy auto-generate tagihan saat halaman pembayaran dibuka.
  try {
    const { ensureBillsForUser } = await import("@/lib/billing");
    await ensureBillsForUser(user.id);
  } catch {
    // ignore
  }

  if (user.role === "TENANT") {
    const payments = await prisma.payment.findMany({
      where: { tenancy: { tenantId: user.id } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      include: { tenancy: { include: { room: { include: { kos: true } } } } },
    });
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Pembayaran saya</h1>
          <Link href="/payments/new" className="btn-primary">
            + Upload bukti pembayaran
          </Link>
        </div>
        {justUploadedId && (
          <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <div className="font-semibold text-emerald-800">
                  Bukti pembayaran berhasil diunggah
                </div>
                <p className="mt-1 text-sm text-emerald-700">
                  Pembayaran Anda dalam proses verifikasi oleh pemilik kos.
                  Anda akan menerima notifikasi setelah pemilik menyelesaikan
                  verifikasi.
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {payments.length === 0 && (
            <EmptyState
              icon={<PaymentIcon />}
              title="Belum ada pembayaran"
              description="Setiap kali Anda upload bukti transfer, akan muncul di sini lengkap dengan status verifikasi."
              action={{
                label: "Upload bukti pembayaran",
                href: "/payments/new",
              }}
            />
          )}
          {payments.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">
                    {MONTHS[p.periodMonth - 1]} {p.periodYear}
                  </div>
                  <div className="text-sm text-slate-600">
                    {p.tenancy.room.kos.name} • Kamar {p.tenancy.room.name}
                  </div>
                  <div className="mt-1 text-sm">{rupiah(p.amount)}</div>
                  {p.note && (
                    <div className="mt-1 text-xs text-slate-500">Catatan: {p.note}</div>
                  )}
                  {p.reviewNote && p.status === "REJECTED" && (
                    <div className="mt-1 text-xs text-red-700">
                      Alasan ditolak: {p.reviewNote}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={p.status} />
                  {p.proofUrl ? (
                    <a
                      href={viewerUrl(p.proofUrl, "Bukti pembayaran")}
                      className="text-sm text-brand-700 hover:underline"
                    >
                      Lihat bukti
                    </a>
                  ) : null}
                  {(p.status === "DUE" || p.status === "REJECTED") && (
                    <Link
                      href={`/payments/new?month=${p.periodMonth}&year=${p.periodYear}`}
                      className="btn-primary text-xs"
                    >
                      {p.status === "DUE" ? "Upload bukti" : "Upload ulang"}
                    </Link>
                  )}
                  {p.status === "VERIFIED" && (
                    <Link
                      href={`/payments/${p.id}/receipt`}
                      className="text-sm text-emerald-700 hover:underline"
                    >
                      📄 Kuitansi
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // OWNER view — filter by periode di query param (default bulan berjalan)
  const now = new Date();
  const month = clampMonth(Number(searchParams?.month)) ?? now.getMonth() + 1;
  const year = clampYear(Number(searchParams?.year)) ?? now.getFullYear();

  const ownerScope = { tenancy: { room: { kos: { ownerId: user.id } } } };
  const [payments, historyPeriods] = await Promise.all([
    prisma.payment.findMany({
      where: {
        ...ownerScope,
        periodMonth: month,
        periodYear: year,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        tenancy: {
          include: {
            tenant: { select: { name: true } },
            room: { include: { kos: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    // Aggregate: berapa banyak riwayat VERIFIED/REJECTED per (month, year) —
    // untuk populate dropdown periode dengan bulan-bulan yang punya data.
    prisma.payment.groupBy({
      by: ["periodMonth", "periodYear"],
      where: {
        ...ownerScope,
        status: { in: ["VERIFIED", "REJECTED"] },
      },
      _count: { _all: true },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      take: 36,
    }),
  ]);

  const toItem = (p: (typeof payments)[number]): PaymentItem => ({
    id: p.id,
    status: p.status as PaymentItem["status"],
    periodMonth: p.periodMonth,
    periodYear: p.periodYear,
    amount: p.amount,
    proofUrl: p.proofUrl,
    note: p.note,
    reviewNote: p.reviewNote,
    tenantName: p.tenancy.tenant.name,
    kosId: p.tenancy.room.kos.id,
    kosName: p.tenancy.room.kos.name,
    roomName: p.tenancy.room.name,
    reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
  });

  const pending = payments.filter((p) => p.status === "PENDING").map(toItem);
  const due = payments.filter((p) => p.status === "DUE").map(toItem);
  const history = payments
    .filter((p) => p.status === "VERIFIED" || p.status === "REJECTED")
    .map(toItem);
  const historyCountsByPeriod = historyPeriods.map((h) => ({
    month: h.periodMonth,
    year: h.periodYear,
    count: h._count._all,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Verifikasi pembayaran</h1>
      <OwnerPaymentsView
        pending={pending}
        due={due}
        history={history}
        period={{ month, year }}
        historyCountsByPeriod={historyCountsByPeriod}
      />
    </div>
  );
}

function clampMonth(m: number): number | null {
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}
function clampYear(y: number): number | null {
  if (!Number.isFinite(y) || y < 2020 || y > 2100) return null;
  return y;
}
