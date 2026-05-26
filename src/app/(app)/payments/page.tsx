import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EmptyState, PaymentIcon } from "@/components/EmptyState";
import { getCurrentUser } from "@/lib/session";
import { verifyPayment } from "./actions";

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
  if (status === "DUE") return <span className="badge-slate">Tagihan dibuat</span>;
  if (status === "PENDING") return <span className="badge-yellow">Menunggu verifikasi</span>;
  if (status === "VERIFIED") return <span className="badge-green">Lunas</span>;
  return <span className="badge-red">Ditolak</span>;
}

export default async function PaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
                      href={p.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // OWNER view
  const payments = await prisma.payment.findMany({
    where: { tenancy: { room: { kos: { ownerId: user.id } } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      tenancy: {
        include: {
          tenant: true,
          room: { include: { kos: true } },
        },
      },
    },
  });

  const pending = payments.filter((p) => p.status === "PENDING");
  const due = payments.filter((p) => p.status === "DUE");
  const others = payments.filter(
    (p) => p.status !== "PENDING" && p.status !== "DUE"
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Verifikasi pembayaran</h1>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 mb-2">
          Menunggu verifikasi ({pending.length})
        </h2>
        <div className="space-y-3">
          {pending.length === 0 && (
            <div className="card text-sm text-slate-500">
              Tidak ada pembayaran yang menunggu verifikasi.
            </div>
          )}
          {pending.map((p) => (
            <PaymentRow key={p.id} p={p} verifyMode />
          ))}
        </div>
      </section>

      {due.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 mb-2">
            Tagihan terbuka — belum diupload ({due.length})
          </h2>
          <div className="space-y-3">
            {due.map((p) => (
              <PaymentRow key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-500 mb-2">
          Riwayat ({others.length})
        </h2>
        <div className="space-y-3">
          {others.map((p) => (
            <PaymentRow key={p.id} p={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

type PaymentWith = Awaited<
  ReturnType<typeof prisma.payment.findMany<{
    include: {
      tenancy: {
        include: {
          tenant: true;
          room: { include: { kos: true } };
        };
      };
    };
  }>>
>[number];

function PaymentRow({ p, verifyMode }: { p: PaymentWith; verifyMode?: boolean }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold">
            {p.tenancy.tenant.name} — {p.tenancy.room.kos.name} / Kamar{" "}
            {p.tenancy.room.name}
          </div>
          <div className="text-sm text-slate-600">
            {MONTHS[p.periodMonth - 1]} {p.periodYear} • {rupiah(p.amount)}
          </div>
          {p.note && (
            <div className="text-xs text-slate-500 mt-1">Catatan: {p.note}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={p.status} />
          {p.proofUrl ? (
            <a
              href={p.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-700 hover:underline"
            >
              Lihat bukti
            </a>
          ) : (
            <span className="text-xs text-slate-400">Belum upload bukti</span>
          )}
        </div>
      </div>
      {verifyMode && (
        <form action={verifyPayment} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="paymentId" value={p.id} />
          <div className="flex-1 min-w-[200px]">
            <label className="label">Catatan review (opsional)</label>
            <input
              name="reviewNote"
              className="input"
              placeholder="Mis. nominal kurang, akan saya cek, dll"
            />
          </div>
          <button
            name="action"
            value="VERIFY"
            type="submit"
            className="btn-success"
          >
            Setujui
          </button>
          <button
            name="action"
            value="REJECT"
            type="submit"
            className="btn-danger"
          >
            Tolak
          </button>
        </form>
      )}
      {!verifyMode && p.reviewNote && (
        <div className="mt-2 text-xs text-slate-500">
          Catatan pemilik: {p.reviewNote}
        </div>
      )}
    </div>
  );
}
