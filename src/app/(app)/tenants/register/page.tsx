import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { OwnerRegisterTenantForm, type KosOption } from "./OwnerRegisterTenantForm";

export const metadata = {
  title: "Daftarkan Penghuni — Kos Baiti",
};

export default async function OwnerRegisterTenantPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageKos(user)) redirect("/dashboard");

  // Ambil daftar kos + kamar AVAILABLE saja untuk dropdown.
  const kosList = await prisma.kos.findMany({
    where: { ownerId: getEffectiveOwnerId(user) },
    orderBy: { name: "asc" },
    include: {
      rooms: {
        where: { status: "AVAILABLE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, monthlyPrice: true },
      },
    },
  });
  const kosOptions: KosOption[] = kosList.map((k) => ({
    id: k.id,
    name: k.name,
    rooms: k.rooms,
  }));

  const totalRoomsAvailable = kosOptions.reduce(
    (s, k) => s + k.rooms.length,
    0
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/tenants"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Kembali ke daftar penghuni
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Daftarkan Penghuni</h1>
        <p className="text-slate-600">
          Untuk penghuni yang tidak bisa mendaftar sendiri (gaptek, tidak
          punya email, dll). Anda daftarkan sekaligus tempatkan di kamar
          — akun langsung aktif dan tagihan pertama otomatis digenerate.
        </p>
      </div>

      {totalRoomsAvailable === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Tidak ada kamar kosong.</div>
          <p className="mt-1">
            Semua kamar di kos Anda sedang terisi. Tambahkan kamar baru di{" "}
            <Link href="/kos" className="underline">
              /kos
            </Link>{" "}
            atau tunggu penghuni lain keluar sebelum mendaftarkan penghuni baru.
          </p>
        </div>
      ) : (
        <OwnerRegisterTenantForm kosOptions={kosOptions} />
      )}
    </div>
  );
}
