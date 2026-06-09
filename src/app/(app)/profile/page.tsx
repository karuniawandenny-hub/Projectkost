import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { viewerUrl } from "@/lib/viewer";
import { PhoneEditForm } from "./PhoneEditForm";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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
              {user.role === "OWNER" ? "Pemilik kos" : "Penghuni"}
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
