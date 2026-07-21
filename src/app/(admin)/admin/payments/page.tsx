import { prisma } from "@/lib/prisma";
import { EmptyState, PaymentIcon } from "@/components/EmptyState";
import {
  AdminPaymentsView,
  type AdminPaymentItem,
} from "./AdminPaymentsView";

const PER_PAGE = 100;

function clampMonth(m: number): number | null {
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}
function clampYear(y: number): number | null {
  if (!Number.isFinite(y) || y < 2020 || y > 2100) return null;
  return y;
}
function clampPage(p: number): number {
  if (!Number.isFinite(p) || p < 1) return 1;
  return Math.floor(p);
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    q?: string;
    month?: string;
    year?: string;
    page?: string;
  };
}) {
  const now = new Date();
  const month = clampMonth(Number(searchParams.month)) ?? now.getMonth() + 1;
  const year = clampYear(Number(searchParams.year)) ?? now.getFullYear();
  const page = clampPage(Number(searchParams.page ?? 1));

  const where: Record<string, unknown> = {
    periodMonth: month,
    periodYear: year,
  };
  if (
    searchParams.status &&
    ["DUE", "PENDING", "VERIFIED", "REJECTED"].includes(searchParams.status)
  ) {
    where.status = searchParams.status;
  }
  if (searchParams.q && searchParams.q.trim()) {
    const q = searchParams.q.trim();
    where.tenancy = {
      OR: [
        { tenant: { name: { contains: q } } },
        { tenant: { email: { contains: q } } },
        { room: { name: { contains: q } } },
        { room: { kos: { name: { contains: q } } } },
      ],
    };
  }

  const [total, payments, historyPeriods] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        tenancy: {
          include: {
            tenant: { select: { name: true, email: true } },
            room: {
              include: {
                kos: {
                  include: { owner: { select: { name: true } } },
                },
              },
            },
          },
        },
        _count: { select: { reminders: true } },
      },
    }),
    // Aggregate periode yang punya data — untuk populate dropdown.
    prisma.payment.groupBy({
      by: ["periodMonth", "periodYear"],
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      take: 36,
    }),
  ]);

  const items: AdminPaymentItem[] = payments.map((p) => ({
    id: p.id,
    status: p.status as AdminPaymentItem["status"],
    periodMonth: p.periodMonth,
    periodYear: p.periodYear,
    amount: p.amount,
    dueDateISO: p.dueDate ? p.dueDate.toISOString() : null,
    proofUrl: p.proofUrl,
    tenantName: p.tenancy.tenant.name,
    tenantEmail: p.tenancy.tenant.email,
    kosId: p.tenancy.room.kos.id,
    kosName: p.tenancy.room.kos.name,
    ownerName: p.tenancy.room.kos.owner.name,
    roomName: p.tenancy.room.name,
    reminderCount: p._count.reminders,
  }));

  const exportParams = new URLSearchParams();
  if (searchParams.status) exportParams.set("status", searchParams.status);
  exportParams.set("month", String(month));
  exportParams.set("year", String(year));
  const exportHref = `/api/admin/payments/export?${exportParams.toString()}`;

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

      {total === 0 && !searchParams.q && !searchParams.status ? (
        <EmptyState
          icon={<PaymentIcon />}
          title="Tidak ada pembayaran"
          description="Pembayaran dari penghuni di seluruh kos akan muncul di sini."
        />
      ) : (
        <AdminPaymentsView
          items={items}
          period={{ month, year }}
          page={page}
          perPage={PER_PAGE}
          total={total}
          historyPeriods={historyPeriods.map((h) => ({
            month: h.periodMonth,
            year: h.periodYear,
          }))}
        />
      )}
    </div>
  );
}
