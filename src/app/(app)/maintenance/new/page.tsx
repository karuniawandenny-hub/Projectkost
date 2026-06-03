import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NewMaintenanceForm } from "./NewMaintenanceForm";

export default async function NewMaintenancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const kosWithRooms = await prisma.kos.findMany({
    where: user.role === "OWNER" ? { ownerId: user.id } : {},
    include: {
      rooms: {
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Link
          href="/maintenance"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Kembali ke Perawatan
        </Link>
        <h1 className="text-2xl font-bold mt-1">Catat perawatan baru</h1>
        <p className="text-sm text-slate-600">
          Pilih <strong>Preventif</strong> untuk perawatan rutin (mis. service
          AC tiap 3 bulan) — bisa di-set berulang otomatis dan dapat pengingat
          H-7/H-3/H-1. Pilih <strong>Korektif</strong> untuk catat kerusakan
          yang Anda temukan sendiri (tanpa lewat komplain penghuni).
        </p>
      </div>

      {kosWithRooms.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Anda belum punya kos. Tambah kos & kamar di menu{" "}
          <Link href="/kos" className="text-brand-700 hover:underline">
            Kos & Kamar
          </Link>{" "}
          dulu.
        </div>
      ) : (
        <NewMaintenanceForm
          kosOptions={kosWithRooms.map((k) => ({
            id: k.id,
            name: k.name,
            rooms: k.rooms,
          }))}
        />
      )}
    </div>
  );
}
