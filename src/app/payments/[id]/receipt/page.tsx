import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PrintButton } from "@/components/PrintButton";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatDateTime(d: Date): string {
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Halaman kuitansi (receipt) pembayaran. Designed untuk Cmd/Ctrl+P
 * → Save as PDF di browser. Layout A5-friendly, B/W bisa print
 * tanpa boros tinta warna.
 *
 * Akses:
 * - Penghuni yang punya tagihan
 * - Pemilik kos yang punya kamar tsb
 * - Admin
 *
 * Hanya tampil kalau status VERIFIED.
 */
export default async function ReceiptPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireUser();

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: {
      tenancy: {
        include: {
          tenant: { select: { id: true, name: true, email: true } },
          room: {
            include: {
              kos: {
                include: {
                  owner: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!payment) notFound();
  if (payment.status !== "VERIFIED") notFound();

  // Hak akses: tenant pemilik tagihan, owner kos, atau admin
  const isTenant = payment.tenancy.tenant.id === me.id;
  const isOwner = payment.tenancy.room.kos.owner.id === me.id;
  const isAdmin = me.role === "ADMIN";
  if (!isTenant && !isOwner && !isAdmin) notFound();

  const periodLabel = `${MONTHS[payment.periodMonth - 1]} ${payment.periodYear}`;
  const receiptNo = `KB-${payment.id.slice(-8).toUpperCase()}`;

  return (
    <main className="bg-slate-100 min-h-screen p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl bg-white text-slate-900 shadow-md print:shadow-none">
        {/* Print controls */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-500">
            Kuitansi pembayaran — Kos Baiti
          </div>
          <PrintButton />
        </div>

        <div className="px-8 py-8 sm:px-10 sm:py-10">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Kuitansi Pembayaran
              </div>
              <h1 className="mt-1 text-2xl font-bold">Kos Baiti</h1>
              <p className="text-xs text-slate-500">
                Forum komunikasi pemilik &amp; penghuni kos
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">No. Kuitansi</div>
              <div className="font-mono text-sm font-semibold">{receiptNo}</div>
            </div>
          </div>

          {/* Info */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Dibayar oleh
              </div>
              <div className="mt-1 font-medium">{payment.tenancy.tenant.name}</div>
              <div className="text-xs text-slate-500">
                {payment.tenancy.tenant.email}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Diterima oleh
              </div>
              <div className="mt-1 font-medium">
                {payment.tenancy.room.kos.owner.name}
              </div>
              <div className="text-xs text-slate-500">
                {payment.tenancy.room.kos.owner.email}
              </div>
            </div>
          </div>

          {/* Detail */}
          <div className="mt-6 rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="px-4 py-2.5 text-slate-500">Kos</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {payment.tenancy.room.kos.name}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-500">Kamar</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {payment.tenancy.room.name}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-500">Periode</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {periodLabel}
                  </td>
                </tr>
                {payment.dueDate && (
                  <tr>
                    <td className="px-4 py-2.5 text-slate-500">Jatuh tempo</td>
                    <td className="px-4 py-2.5 text-right">
                      {formatDate(payment.dueDate)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2.5 text-slate-500">
                    Tanggal verifikasi
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {payment.reviewedAt
                      ? formatDateTime(payment.reviewedAt)
                      : "-"}
                  </td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="px-4 py-3 font-semibold">Total dibayar</td>
                  <td className="px-4 py-3 text-right text-lg font-bold">
                    Rp {payment.amount.toLocaleString("id-ID")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Status */}
          <div className="mt-5 flex items-center justify-center">
            <div className="rounded-full border-2 border-emerald-500 bg-emerald-50 px-4 py-1.5 text-sm font-bold uppercase tracking-widest text-emerald-700">
              ✓ Lunas
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            Kuitansi ini dicetak otomatis dari sistem Kos Baiti pada{" "}
            {formatDateTime(new Date())}.
            <br />
            Dokumen ini sah tanpa tanda tangan.
          </div>
        </div>
      </div>
    </main>
  );
}

