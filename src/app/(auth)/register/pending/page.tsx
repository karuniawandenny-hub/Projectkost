import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { CheckStatusButton } from "./CheckStatusButton";

export default async function RegisterPendingPage() {
  const user = await getCurrentUser();

  // Kalau user sudah ACTIVE (admin sudah approve), langsung lempar ke
  // dashboard - tidak perlu lagi tampilkan halaman menunggu.
  if (user && user.status === "ACTIVE") {
    if (user.role === "ADMIN") redirect("/admin");
    // Tenant yang belum onboarding -> tetap ke onboarding
    if (user.role === "TENANT" && !user.onboardedAt) redirect("/onboarding");
    redirect("/dashboard");
  }
  // Kalau SUSPENDED (di-tolak), arahkan ke login.
  if (user && user.status === "SUSPENDED") {
    redirect("/login?reason=rejected");
  }

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
      <div className="mt-6 flex flex-wrap gap-2">
        {user ? (
          <>
            <CheckStatusButton />
            <form action="/logout" method="POST">
              <button type="submit" className="btn-secondary">
                Keluar
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className="btn-primary">
              Ke halaman login
            </Link>
            <Link href="/" className="btn-secondary">
              Kembali ke beranda
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
