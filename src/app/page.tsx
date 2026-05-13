import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";

export default async function HomePage() {
  const session = await readSession();
  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">
              K
            </div>
            <span className="font-semibold">Kelola Kos</span>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className="btn-secondary">
              Masuk
            </Link>
            <Link href="/register" className="btn-primary">
              Daftar
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Kelola bisnis kos jadi simpel.
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Satu aplikasi yang menghubungkan pemilik dan penghuni kos —
              data penghuni, pembayaran, hingga komplain, semua tercatat rapi.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/register" className="btn-primary">
                Mulai sekarang
              </Link>
              <Link href="/login" className="btn-secondary">
                Sudah punya akun
              </Link>
            </div>
          </div>
          <div className="grid gap-4">
            <Feature
              title="Data penghuni terpusat"
              desc="Simpan data semua kos & penghuni Anda di satu tempat. Wajib KTP + foto diri."
            />
            <Feature
              title="Bukti pembayaran rapi"
              desc="Penghuni upload bukti transfer tiap bulan, pemilik verifikasi sekali klik."
            />
            <Feature
              title="Komplain dengan foto"
              desc="Penghuni laporkan masalah lengkap dengan foto — langsung sampai ke pemilik."
            />
          </div>
        </div>
      </section>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Kelola Kos
        </div>
      </footer>
    </main>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="card">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{desc}</div>
    </div>
  );
}
