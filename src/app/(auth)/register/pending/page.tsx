import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

export default async function RegisterPendingPage() {
  const user = await getCurrentUser();
  const isTenant = user?.role === "TENANT";

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">
            {isTenant
              ? "Menunggu persetujuan"
              : "Pendaftaran terkirim"}
          </h1>
          {isTenant ? (
            <>
              <p className="mt-1 text-sm text-slate-600">
                Terima kasih, <span className="font-medium">{user?.name}</span>.
                Data Anda — termasuk foto KTP & selfie — telah dikirim ke pemilik
                kos / administrator untuk diverifikasi.
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Setelah disetujui, dashboard Anda akan otomatis aktif dan pemilik
                kos akan mengassign Anda ke kamar yang sesuai. Anda akan menerima
                notifikasi begitu prosesnya selesai.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600">
                Akun <span className="font-medium">pemilik kos</span> Anda sedang
                menunggu persetujuan administrator. Anda akan bisa masuk setelah
                akun disetujui.
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Setelah disetujui, gunakan email & password yang baru Anda buat
                untuk masuk di halaman login.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        {user ? (
          <form action="/logout" method="POST">
            <button type="submit" className="btn-secondary">
              Keluar
            </button>
          </form>
        ) : (
          <Link href="/login" className="btn-primary">
            Ke halaman login
          </Link>
        )}
        <Link href="/" className="btn-secondary">
          Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}
