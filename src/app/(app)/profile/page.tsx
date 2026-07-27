import { redirect } from "next/navigation";
import { getCurrentUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { viewerUrl } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";
import { PushToggle } from "@/components/PushToggle";
import { PhoneEditForm } from "./PhoneEditForm";
import { NotifPrefsForm } from "./NotifPrefsForm";
import { DefaultSignatureForm } from "./DefaultSignatureForm";
import { getMyNotifPrefs } from "./actions";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const notifPrefs = await getMyNotifPrefs();

  // Owner/manager: ambil defaultSignatureUrl dari DB
  const defaultSignatureUrl = canManageKos(user)
    ? (
        await prisma.user.findUnique({
          where: { id: user.id },
          select: { defaultSignatureUrl: true },
        })
      )?.defaultSignatureUrl ?? null
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Profil saya</h1>
      <div className="card">
        <div className="flex items-start gap-4">
          {user.selfiePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.selfiePhotoUrl}
              alt={user.name}
              className="h-20 w-20 rounded-full object-cover border"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-slate-200 grid place-items-center font-bold text-2xl text-slate-600">
              {user.name.slice(0, 1)}
            </div>
          )}
          <div>
            <div className="text-lg font-semibold">{user.name}</div>
            <div className="text-sm text-slate-600">{user.email}</div>
            <div className="text-xs text-slate-500 mt-1">
              {canManageKos(user) ? "Pemilik kos" : "Penghuni"}
            </div>
          </div>
        </div>
        {user.role === "TENANT" && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field label="Foto KTP" url={user.ktpPhotoUrl} />
            <Field label="Foto diri" url={user.selfiePhotoUrl} />
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Kontak WhatsApp</h2>
        <PhoneEditForm currentPhone={user.phone} />
      </div>

      {canManageKos(user) && (
        <div className="card">
          <h2 className="text-lg font-semibold">Tandatangan default</h2>
          <p className="mt-1 mb-3 text-sm text-slate-600">
            Set tandatangan digital yang otomatis muncul di canvas
            setiap kontrak baru — Anda tinggal klik <em>Simpan tandatangan</em>{" "}
            tanpa perlu tanda tangan ulang. Bisa dihapus atau diganti kapan
            saja lewat tombol di bawah.
          </p>
          <DefaultSignatureForm currentUrl={defaultSignatureUrl} />
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold">Notifikasi di HP</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">
          Aktifkan untuk menerima pengingat pembayaran, pengumuman pemilik,
          dan update perawatan langsung di HP — meski aplikasi tidak dibuka.
        </p>
        <PushToggle />
      </div>

      {user.role !== "ADMIN" && (
        <div className="card">
          <h2 className="text-lg font-semibold">Preferensi notifikasi</h2>
          <p className="mt-1 mb-3 text-sm text-slate-600">
            {canManageKos(user)
              ? "Pilih jenis notifikasi aktivitas penghuni yang mau Anda terima lewat HP, email, atau WhatsApp. Atur jam tenang agar tidak terganggu malam hari."
              : "Pilih jenis notifikasi apa yang dikirim lewat HP, email, atau WhatsApp. Atur jam tenang agar tidak terganggu malam hari."}
          </p>
          <NotifPrefsForm
            initialPrefs={notifPrefs}
            role={canManageKos(user) ? "OWNER" : "TENANT"}
          />
        </div>
      )}

      <form action="/logout" method="POST">
        <button className="btn-danger">Keluar</button>
      </form>
    </div>
  );
}

function Field({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs text-slate-500 mb-2">{label}</div>
      {url ? (
        <a href={viewerUrl(url, label)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="max-h-40 w-auto rounded-md border"
          />
        </a>
      ) : (
        <div className="text-sm text-slate-400">Belum diunggah</div>
      )}
    </div>
  );
}
