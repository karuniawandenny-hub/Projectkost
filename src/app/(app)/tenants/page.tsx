import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { endTenancy } from "../kos/actions";

export default async function TenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/dashboard");

  const tenancies = await prisma.tenancy.findMany({
    where: { status: "ACTIVE", room: { kos: { ownerId: user.id } } },
    include: {
      tenant: true,
      room: { include: { kos: true } },
    },
    orderBy: { startDate: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Penghuni aktif</h1>
      <div className="space-y-3">
        {tenancies.length === 0 && (
          <div className="card text-sm text-slate-500">
            Belum ada penghuni aktif. Assign penghuni dari halaman{" "}
            <Link href="/kos" className="text-brand-700 hover:underline">
              Kos & Kamar
            </Link>
            .
          </div>
        )}
        {tenancies.map((t) => (
          <div key={t.id} className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex gap-3">
                {t.tenant.selfiePhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.tenant.selfiePhotoUrl}
                    alt={t.tenant.name}
                    className="h-14 w-14 rounded-full object-cover border"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-slate-200 grid place-items-center font-bold text-slate-600">
                    {t.tenant.name.slice(0, 1)}
                  </div>
                )}
                <div>
                  <div className="font-semibold">{t.tenant.name}</div>
                  <div className="text-sm text-slate-600">{t.tenant.phone}</div>
                  <div className="text-sm text-slate-500">
                    {t.room.kos.name} • Kamar {t.room.name}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {t.tenant.ktpPhotoUrl && (
                  <a
                    href={t.tenant.ktpPhotoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                  >
                    Lihat KTP
                  </a>
                )}
                <form action={endTenancy}>
                  <input type="hidden" name="tenancyId" value={t.id} />
                  <button
                    className="btn-danger"
                    type="submit"
                    formNoValidate
                  >
                    Akhiri sewa
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
