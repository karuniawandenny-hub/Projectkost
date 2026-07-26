import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { InviteManagerForm } from "./InviteManagerForm";
import { RevokeManagerButton } from "./RevokeManagerButton";
import { CancelInviteButton } from "./CancelInviteButton";

function formatWhen(d: Date): string {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ManagersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // OWNER-only. MANAGER TIDAK boleh manage MANAGER lain.
  if (user.role !== "OWNER") redirect("/dashboard");

  const [managers, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: "MANAGER",
        managedByOwnerId: user.id,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    }),
    prisma.managerInvite.findMany({
      where: {
        ownerId: user.id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Anggota Tim</h1>
        <p className="mt-1 text-sm text-slate-600">
          Undang pengelola untuk bantu Anda mengelola kos. Pengelola punya
          akses setara Anda ke seluruh kos milik Anda — <em>kecuali</em>{" "}
          mengundang / mencabut akses pengelola lain.
        </p>
      </div>

      {/* Invite form */}
      <div className="card">
        <h2 className="mb-3 font-semibold">Undang pengelola baru</h2>
        <p className="mb-3 text-xs text-slate-500">
          Masukkan email calon pengelola. Sistem akan kirim link undangan.
          Setelah mereka klik link & set password, akun langsung aktif.
        </p>
        <InviteManagerForm />
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">
            Undangan menunggu ({pendingInvites.length})
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Undangan ini belum diterima. Kalau lupa forward, batalkan &amp;
            kirim ulang.
          </p>
          <div className="space-y-2">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {inv.email}
                  </div>
                  <div className="text-xs text-slate-500">
                    Dikirim {formatWhen(inv.createdAt)} · berlaku sampai{" "}
                    {formatWhen(inv.expiresAt)}
                  </div>
                </div>
                <CancelInviteButton id={inv.id} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active managers */}
      <div className="card">
        <h2 className="mb-3 font-semibold">
          Pengelola aktif ({managers.length})
        </h2>
        {managers.length === 0 ? (
          <div className="text-sm text-slate-500">
            Belum ada pengelola aktif. Undang lewat form di atas.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {managers.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {m.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">
                      {m.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {m.email} · bergabung {formatWhen(m.createdAt)}
                    </div>
                  </div>
                </div>
                <RevokeManagerButton
                  managerId={m.id}
                  managerName={m.name}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
