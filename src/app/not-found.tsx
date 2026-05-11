import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="text-center">
        <div className="text-5xl font-bold">404</div>
        <p className="mt-2 text-slate-600">Halaman tidak ditemukan.</p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Kembali ke beranda
        </Link>
      </div>
    </main>
  );
}
