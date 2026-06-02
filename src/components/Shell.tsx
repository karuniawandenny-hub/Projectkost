import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotifBell } from "./NotifBell";
import { UserMenu } from "./UserMenu";
import { MobileNavMenu } from "./MobileNavMenu";

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
        { href: "/maintenance", label: "Perawatan" },
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
    <main className="relative min-h-screen bg-slate-50">
      <header className="relative z-20 border-b bg-white">
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
                width={40}
                height={40}
                className="h-9 w-9 max-w-full object-contain sm:h-10 sm:w-10"
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
              {/* Hamburger menu di mobile - gantikan horizontal-scroll nav
                  yang trigger iOS Safari overflow */}
              <div className="sm:hidden">
                <MobileNavMenu
                  items={nav}
                  buttonClassName="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                />
              </div>
              <UserMenu
                label={user.name.split(" ")[0]}
                summaryClassName="block max-w-[110px] truncate rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 sm:max-w-none"
                subtitle={`Masuk sebagai ${isOwner ? "Pemilik" : "Penghuni"}`}
                items={[
                  { type: "link", href: "/profile", label: "Profil saya" },
                  {
                    type: "form",
                    action: "/logout",
                    label: "Keluar",
                    variant: "danger",
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6">
        {children}
      </section>
    </main>
  );
}
