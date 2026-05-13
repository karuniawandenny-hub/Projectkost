import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { setUserRole, setUserStatus } from "../../../actions";
import { ResetPasswordForm } from "./ResetPasswordForm";

function RoleBadge({ role }: { role: string }) {
  if (role === "ADMIN") return <span className="badge-blue">Admin</span>;
  if (role === "OWNER") return <span className="badge-green">Pemilik</span>;
  return <span className="badge-slate">Penghuni</span>;
}
function StatusBadge({ status }: { status: string }) {
  if (status === "PENDING") return <span className="badge-yellow">Menunggu</span>;
  if (status === "SUSPENDED") return <span className="badge-red">Nonaktif</span>;
  return <span className="badge-green">Aktif</span>;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getCurrentUser();
  const u = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      ownedKos: { select: { id: true, name: true } },
      tenancies: {
        where: { status: "ACTIVE" },
        include: { room: { include: { kos: { select: { name: true } } } } },
      },
    },
  });
  if (!u) notFound();

  const isSelf = me?.id === u.id;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/users" className="text-sm text-brand-700 hover:underline">
          ← Daftar pengguna
        </Link>
        <h1 className="text-2xl font-bold mt-1">{u.name}</h1>
        <div className="text-sm text-slate-600">
          {u.email}
          {u.username ? ` • @${u.username}` : ""}
          {u.phone ? ` • ${u.phone}` : ""}
        </div>
        <div className="mt-2 flex gap-2">
          <RoleBadge role={u.role} />
          <StatusBadge status={u.status} />
        </div>
      </div>

      {isSelf && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Anda tidak bisa mengubah peran/status atau mereset password akun Anda
          sendiri dari halaman ini.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Ubah peran</h2>
          <form action={setUserRole} className="mt-3 flex items-end gap-2">
            <input type="hidden" name="userId" value={u.id} />
            <div className="flex-1">
              <label className="label">Peran</label>
              <select
                name="role"
                defaultValue={u.role}
                disabled={isSelf}
                className="input"
              >
                <option value="TENANT">Penghuni</option>
                <option value="OWNER">Pemilik</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <button type="submit" disabled={isSelf} className="btn-primary">
              Simpan
            </button>
          </form>
        </div>

        <div className="card">
          <h2 className="font-semibold">Ubah status</h2>
          <div className="mt-3 flex gap-2 flex-wrap">
            {u.status !== "ACTIVE" && (
              <form action={setUserStatus}>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <button disabled={isSelf} type="submit" className="btn-success">
                  Aktifkan
                </button>
              </form>
            )}
            {u.status !== "SUSPENDED" && (
              <form action={setUserStatus}>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="status" value="SUSPENDED" />
                <button disabled={isSelf} type="submit" className="btn-danger">
                  Nonaktifkan
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="font-semibold">Reset password</h2>
          <p className="mt-1 text-sm text-slate-600">
            Set password baru manual untuk user ini. User akan bisa langsung login
            dengan password tersebut.
          </p>
          <div className="mt-3">
            <ResetPasswordForm userId={u.id} disabled={isSelf} />
          </div>
        </div>

        {u.role === "OWNER" && (
          <div className="card lg:col-span-2">
            <h2 className="font-semibold">Kos yang dimiliki</h2>
            {u.ownedKos.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Belum ada.</p>
            ) : (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {u.ownedKos.map((k) => (
                  <li key={k.id}>{k.name}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {u.role === "TENANT" && (
          <div className="card lg:col-span-2">
            <h2 className="font-semibold">Penyewaan aktif</h2>
            {u.tenancies.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Belum ada penyewaan.</p>
            ) : (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {u.tenancies.map((t) => (
                  <li key={t.id}>
                    {t.room.kos.name} • Kamar {t.room.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
