import Link from "next/link";

export default function RegisterPendingPage() {
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
          <h1 className="text-2xl font-semibold">Pendaftaran terkirim</h1>
          <p className="mt-1 text-sm text-slate-600">
            Terima kasih. Akun <span className="font-medium">pemilik kos</span> Anda
            sedang menunggu persetujuan administrator. Anda akan bisa masuk setelah
            akun disetujui.
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Setelah disetujui, gunakan email & password yang baru Anda buat untuk
            masuk di halaman login.
          </p>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <Link href="/login" className="btn-primary">
          Ke halaman login
        </Link>
        <Link href="/" className="btn-secondary">
          Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}
