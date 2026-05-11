import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NewPaymentForm } from "./NewPaymentForm";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TENANT") redirect("/payments");

  const tenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, status: "ACTIVE" },
    include: { room: { include: { kos: true } } },
  });
  if (!tenancy) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold">Belum bisa upload pembayaran</h1>
        <p className="mt-2 text-sm text-slate-600">
          Anda belum di-assign ke kamar. Hubungi pemilik kos untuk melanjutkan.
        </p>
        <Link href="/dashboard" className="btn-secondary mt-4 inline-flex">
          Kembali
        </Link>
      </div>
    );
  }

  const now = new Date();
  const defaultMonth = parseInt(searchParams.month ?? String(now.getMonth() + 1), 10);
  const defaultYear = parseInt(searchParams.year ?? String(now.getFullYear()), 10);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/payments" className="text-sm text-brand-700 hover:underline">
          ← Pembayaran
        </Link>
        <h1 className="text-2xl font-bold mt-1">Upload bukti pembayaran</h1>
        <p className="text-sm text-slate-600">
          {tenancy.room.kos.name} • Kamar {tenancy.room.name} •{" "}
          Rp {tenancy.room.monthlyPrice.toLocaleString("id-ID")}/bulan
        </p>
      </div>

      <div className="card">
        <NewPaymentForm
          defaultMonth={defaultMonth}
          defaultYear={defaultYear}
          suggestedAmount={tenancy.room.monthlyPrice}
        />
      </div>
    </div>
  );
}
