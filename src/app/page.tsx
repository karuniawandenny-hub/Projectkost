import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";

export default async function HomePage() {
  const session = await readSession();
  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-indigo-50">
      {/* Decorative gradient blobs (CSS-only, GPU-accelerated, no image
          requests). pointer-events-none agar tidak ganggu klik. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-gradient-to-br from-blue-300 to-purple-300 opacity-30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-gradient-to-br from-pink-300 to-amber-300 opacity-25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-300 to-sky-300 opacity-20 blur-3xl"
      />

      <header className="relative z-10 border-b border-white/40 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white grid place-items-center font-bold shadow-md shadow-indigo-500/30">
              B
            </div>
            <span className="font-semibold text-slate-900">Baiti Kos</span>
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

      <section className="relative z-10 mx-auto max-w-5xl px-4 py-12 sm:py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Online &amp; siap melayani
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Forum Komunikasi
              </span>
              <br />
              <span className="text-slate-900">Baiti Kos</span>
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Satu aplikasi yang menghubungkan pemilik dan penghuni kos —
              data penghuni, pembayaran, hingga komplain, semua tercatat rapi.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="btn inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-blue-700 hover:to-indigo-700"
              >
                Mulai sekarang
                <ArrowIcon />
              </Link>
              <Link href="/login" className="btn-secondary">
                Sudah punya akun
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <Feature
              icon={<UserIcon />}
              title="Data penghuni terpusat"
              desc="Simpan data semua kos & penghuni Anda di satu tempat. Wajib KTP + foto diri."
              color="blue"
            />
            <Feature
              icon={<WalletIcon />}
              title="Bukti pembayaran rapi"
              desc="Penghuni upload bukti transfer tiap bulan, pemilik verifikasi sekali klik."
              color="emerald"
            />
            <Feature
              icon={<ChatIcon />}
              title="Komplain dengan foto"
              desc="Penghuni laporkan masalah lengkap dengan foto — langsung sampai ke pemilik."
              color="amber"
            />
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/40 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Baiti Kos
        </div>
      </footer>
    </main>
  );
}

type FeatureColor = "blue" | "emerald" | "amber";

const colorMap: Record<
  FeatureColor,
  { ring: string; iconBg: string; iconText: string }
> = {
  blue: {
    ring: "hover:ring-blue-200",
    iconBg: "bg-blue-100",
    iconText: "text-blue-600",
  },
  emerald: {
    ring: "hover:ring-emerald-200",
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-600",
  },
  amber: {
    ring: "hover:ring-amber-200",
    iconBg: "bg-amber-100",
    iconText: "text-amber-600",
  },
};

function Feature({
  icon,
  title,
  desc,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: FeatureColor;
}) {
  const c = colorMap[color];
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm ring-1 ring-transparent transition hover:shadow-md ${c.ring}`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.iconBg} ${c.iconText}`}
      >
        {icon}
      </div>
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-sm text-slate-600">{desc}</div>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" />
      <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
