import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotifBell } from "./NotifBell";

type Props = {
  user: User;
  children: ReactNode;
};

type NavItem = { href: string; label: string; badge?: number };

export default async function Shell({ user, children }: Props) {
  const isOwner = user.role === "OWNER";

  const [unread, pendingTenants] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    isOwner
      ? prisma.user.count({ where: { role: "TENANT", status: "PENDING" } })
      : Promise.resolve(0),
  ]);

  const nav: NavItem[] = isOwner
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/kos", label: "Kos & Kamar" },
        {
          href: "/tenants",
          label: "Penghuni",
          badge: pendingTenants || undefined,
        },
        { href: "/payments", label: "Pembayaran" },
        { href: "/complaints", label: "Komplain" },
        { href: "/reports", label: "Laporan" },
      ]
    : [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/payments", label: "Pembayaran" },
        { href: "/complaints", label: "Komplain" },
        { href: "/profile", label: "Profil" },
      ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">
              K
            </div>
            <span className="font-semibold hidden sm:inline">Kelola Kos</span>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap inline-flex items-center gap-1"
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
            <NotifBell unread={unread} />
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">
                {user.name.split(" ")[0]}
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-white p-2 shadow-lg">
                <div className="px-3 py-2 text-xs text-slate-500">
                  Masuk sebagai{" "}
                  <span className="font-semibold text-slate-700">
                    {isOwner ? "Pemilik" : "Penghuni"}
                  </span>
                </div>
                <Link
                  href="/profile"
                  className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100"
                >
                  Profil saya
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
