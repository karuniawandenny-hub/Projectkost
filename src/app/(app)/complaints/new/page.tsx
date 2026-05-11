import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NewComplaintForm } from "./NewComplaintForm";

export default async function NewComplaintPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TENANT") redirect("/complaints");

  const tenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, status: "ACTIVE" },
    include: { room: { include: { kos: true } } },
  });
  if (!tenancy) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold">Belum bisa buat komplain</h1>
        <p className="mt-2 text-sm text-slate-600">
          Anda belum di-assign ke kamar manapun. Hubungi pemilik kos.
        </p>
        <Link href="/dashboard" className="btn-secondary mt-4 inline-flex">
          Kembali
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/complaints" className="text-sm text-brand-700 hover:underline">
          ← Komplain
        </Link>
        <h1 className="text-2xl font-bold mt-1">Buat komplain</h1>
        <p className="text-sm text-slate-600">
          {tenancy.room.kos.name} • Kamar {tenancy.room.name}
        </p>
      </div>
      <div className="card">
        <NewComplaintForm />
      </div>
    </div>
  );
}
