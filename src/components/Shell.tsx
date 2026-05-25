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

  const [unread, pendingTenants, pendingMoveOwner] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    isOwner
      ? prisma.user.count({ where: { role: "TENANT", status: "PENDING" } })
      : Promise.resolve(0),
    isOwner
      ? prisma.roomMoveRequest.count({
          where: { status: "PENDING", toRoom: { kos: { ownerId: user.id } } },
        })
      : Promise.resolve(0),
  ]);

  // Gabungkan badge "Penghuni": pengajuan akun + permintaan pindah.
  const ownerTenantsBadge =
    (pendingTenants || 0) + (pendingMoveOwner || 0) || undefined;

  const nav: NavItem[] = isOwner
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/kos", label: "Kos & Kamar" },
        {
          href: "/tenants",
          label: "Penghuni",
          badge: ownerTenantsBadge,
        },
        { href: "/payments", label: "Pembayaran" },
        { href: "/complaints", label: "Komplain" },
        { href: "/reports", label: "Laporan" },
      ]
    : [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/move-request", label: "Pindah Kamar" },
        { href: "/payments", label: "Pembayaran" },
        { href: "/complaints", label: "Komplain" },
        { href: "/profile", label: "Profil" },
      ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-3 sm:px-4">
          {/* Top row: logo + actions (notif + user) */}
          <div className="flex items-center justify-between gap-3 py-2 sm:py-3">
            <Link
              href="/dashboard"
              className="flex items-center shrink-0"
              aria-label="Kos Baiti — Dashboard"
            >
              <img
                src="/kos-baiti-logo.png"
                alt="Kos Baiti"
                className="h-9 w-auto sm:h-10"
              />
            </Link>

            {/* Desktop nav (di tengah) */}
            <nav className="hidden flex-1 items-center justify-center gap-1 overflow-x-auto sm:flex">
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

            <div className="flex items-center gap-2 shrink-0">
              <NotifBell unread={unread} />
              <details className="relative">
                <summary className="block max-w-[110px] cursor-pointer list-none truncate rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 sm:max-w-none">
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

          {/* Mobile nav: baris kedua, horizontal-scrollable di dalam container */}
          <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 py-1.5 sm:hidden">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap inline-flex items-center gap-1 shrink-0"
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
