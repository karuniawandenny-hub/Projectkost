import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { viewerUrl } from "@/lib/viewer";
import { setUserRole, setUserStatus } from "../../../actions";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { EditProfileForm } from "./EditProfileForm";
import { UploadDocsForm } from "@/app/(app)/tenants/UploadDocsForm";

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
        <div className="card lg:col-span-2">
          <h2 className="font-semibold">Edit profil</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ubah nama, email, nomor HP, atau username. Kosongkan field yang
            tidak ingin diubah.
          </p>
          <div className="mt-3">
            <EditProfileForm
              userId={u.id}
              defaults={{
                name: u.name,
                email: u.email,
                phone: u.phone,
                username: u.username,
              }}
            />
          </div>
        </div>

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

        {u.role === "TENANT" && (
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold">Dokumen identitas</h2>
              {(!u.ktpPhotoUrl || !u.selfiePhotoUrl) && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  ⚠️ Kurang lengkap
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              KTP & foto diri wajib ada untuk penghuni. Kalau kurang, admin bisa
              upload atas nama penghuni.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <IdentityCard
                label="Foto KTP"
                url={u.ktpPhotoUrl}
                viewerLabel="Foto KTP"
              />
              <IdentityCard
                label="Foto Diri (Selfie)"
                url={u.selfiePhotoUrl}
                viewerLabel="Foto Diri"
              />
            </div>
            <div className="mt-4">
              <UploadDocsForm
                userId={u.id}
                hasKtp={!!u.ktpPhotoUrl}
                hasSelfie={!!u.selfiePhotoUrl}
                tenantName={u.name}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IdentityCard({
  label,
  url,
  viewerLabel,
}: {
  label: string;
  url: string | null;
  viewerLabel: string;
}) {
  if (url) {
    return (
      <a
        href={viewerUrl(url, viewerLabel)}
        className="block rounded-lg border border-slate-200 bg-white p-2 transition hover:border-brand-400 hover:shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="mb-2 h-28 w-full rounded object-cover"
        />
        <div className="text-xs font-medium text-slate-800">{label}</div>
        <div className="text-[10px] text-brand-700">Klik untuk perbesar</div>
      </a>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50/50 p-2 text-center">
      <div className="grid h-28 w-full place-items-center rounded bg-red-50 text-3xl text-red-300">
        📄
      </div>
      <div className="mt-2 text-xs font-medium text-slate-700">{label}</div>
      <div className="text-[10px] font-semibold text-red-700">
        Belum diupload
      </div>
    </div>
  );
}
