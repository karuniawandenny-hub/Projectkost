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
    { href: "/admin/system", label: "Sistem" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-slate-900 text-white sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-white text-slate-900 grid place-items-center font-bold">
              A
            </div>
            <span className="font-semibold">Admin Kelola Kos</span>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
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

          <div className="flex items-center gap-2">
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
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
