import Link from "next/link";
import { ReloadButton } from "./ReloadButton";

export const metadata = {
  title: "Offline — Kos Baiti",
};

/**
 * Halaman fallback offline. Service worker akan cache halaman ini
 * dan tampilkan kalau user tidak ada koneksi internet saat navigasi.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-100 via-violet-50 to-rose-100">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="rounded-3xl border border-white/40 bg-white/80 px-8 py-10 shadow-xl backdrop-blur-md">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-8 w-8 text-slate-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.789M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Tidak ada koneksi
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Anda sedang offline. Halaman ini ditampilkan oleh aplikasi Kos
            Baiti yang sudah Anda install. Cek koneksi internet Anda lalu
            coba muat ulang.
          </p>
          <div className="mt-5 flex flex-col items-center gap-2">
            <ReloadButton />
            <Link href="/" className="text-xs text-slate-600 hover:underline">
              Ke beranda
            </Link>
          </div>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          💡 Pasang aplikasi Kos Baiti ke layar utama lewat menu browser →
          &quot;Add to Home Screen&quot; untuk akses cepat seperti app native.
        </p>
      </div>
    </main>
  );
}
