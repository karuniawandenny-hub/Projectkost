import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const pendingOwners = await prisma.user.count({
    where: { role: "OWNER", status: "PENDING" },
  });

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/users", label: "Pengguna", badge: pendingOwners || undefined },
    { href: "/admin/kos", label: "Semua Kos" },
    { href: "/admin/payments", label: "Pembayaran" },
    { href: "/admin/complaints", label: "Komplain" },
    { href: "/admin/reminders", label: "Reminder" },
    { href: "/admin/system", label: "Sistem" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-slate-900 text-white sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-3 sm:px-4">
          {/* Top row: logo + user dropdown (selalu satu baris) */}
          <div className="flex items-center justify-between gap-3 py-2 sm:py-3">
            <Link
              href="/admin"
              className="flex items-center gap-1.5 shrink-0"
              aria-label="Admin Kos Baiti"
            >
              <img
                src="/kos-baiti-logo.png"
                alt="Kos Baiti"
                className="h-9 w-auto rounded-md bg-white p-0.5 sm:h-10"
              />
              <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-900 sm:px-2 sm:text-[10px]">
                Admin
              </span>
            </Link>

            {/* Desktop nav (di tengah) */}
            <nav className="hidden flex-1 items-center justify-center gap-1 overflow-x-auto sm:flex">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-800 whitespace-nowrap inline-flex items-center gap-1"
                >
                  <span>{n.label}</span>
                  {n.badge ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900">
                      {n.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-full bg-slate-700 px-3 py-1.5 text-sm font-medium">
                  {user.username ?? user.name.split(" ")[0]}
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-white p-2 shadow-lg text-slate-900">
                  <div className="px-3 py-2 text-xs text-slate-500">
                    Masuk sebagai <span className="font-semibold">Administrator</span>
                  </div>
                  <Link
                    href="/admin/account"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Akun & ganti password
                  </Link>
                  <form action="/logout" method="POST">
                    <button
                      type="submit"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      Keluar
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>

          {/* Mobile nav: baris kedua, horizontal-scrollable di dalam container */}
          <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-800 py-1.5 sm:hidden">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800 whitespace-nowrap inline-flex items-center gap-1 shrink-0"
              >
                <span>{n.label}</span>
                {n.badge ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-slate-900">
                    {n.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}
