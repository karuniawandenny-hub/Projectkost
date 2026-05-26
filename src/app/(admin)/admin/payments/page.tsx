import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TestControls } from "./TestControls";
import { EmptyState, PaymentIcon } from "@/components/EmptyState";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function StatusBadge({ status }: { status: string }) {
  if (status === "DUE") return <span className="badge-yellow">Belum upload</span>;
  if (status === "PENDING") return <span className="badge-yellow">Menunggu</span>;
  if (status === "VERIFIED") return <span className="badge-green">Lunas</span>;
  return <span className="badge-red">Ditolak</span>;
}

function formatDateID(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const where: Record<string, unknown> = {};
  if (
    searchParams.status &&
    ["PENDING", "VERIFIED", "REJECTED"].includes(searchParams.status)
  ) {
    where.status = searchParams.status;
  }
  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      tenancy: {
        include: {
          tenant: { select: { name: true, email: true } },
          room: { include: { kos: { include: { owner: { select: { name: true } } } } } },
        },
      },
      _count: { select: { reminders: true } },
    },
  });

  const filters = [
    { href: "/admin/payments", label: "Semua" },
    { href: "/admin/payments?status=PENDING", label: "Menunggu" },
    { href: "/admin/payments?status=VERIFIED", label: "Lunas" },
    { href: "/admin/payments?status=REJECTED", label: "Ditolak" },
  ];

  const exportHref = searchParams.status
    ? `/api/admin/payments/export?status=${searchParams.status}`
    : "/api/admin/payments/export";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Pembayaran (sistem)</h1>
        <a
          href={exportHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          download
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          Export CSV
        </a>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
          >
            {f.label}
          </Link>
        ))}
      </div>
      <div className="space-y-2">
        {payments.length === 0 && (
          <EmptyState
            icon={<PaymentIcon />}
            title="Tidak ada pembayaran"
            description="Pembayaran dari penghuni di seluruh kos akan muncul di sini."
          />
        )}
        {payments.map((p) => (
          <div key={p.id} className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">
                  {p.tenancy.tenant.name} → {p.tenancy.room.kos.name} / Kamar{" "}
                  {p.tenancy.room.name}
                </div>
                <div className="text-xs text-slate-500">
                  Pemilik: {p.tenancy.room.kos.owner.name} • Periode{" "}
                  {MONTHS[p.periodMonth - 1]} {p.periodYear} • Rp{" "}
                  {p.amount.toLocaleString("id-ID")}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Jatuh tempo:{" "}
                  <span className="font-medium text-slate-700">
                    {formatDateID(p.dueDate)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={p.status} />
                {p.proofUrl ? (
                <a
                  href={p.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-700 hover:underline"
                >
                  Bukti
                </a>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
                {p.status === "VERIFIED" && (
                  <Link
                    href={`/payments/${p.id}/receipt`}
                    target="_blank"
                    className="text-sm text-emerald-700 hover:underline"
                  >
                    📄 Kuitansi
                  </Link>
                )}
              </div>
            </div>
            <TestControls paymentId={p.id} reminderCount={p._count.reminders} />
          </div>
        ))}
      </div>
    </div>
  );
}
