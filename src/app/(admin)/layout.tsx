import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { UserMenu } from "@/components/UserMenu";
import { MobileNavMenu } from "@/components/MobileNavMenu";
import { DesktopNavLinks } from "@/components/NavLinks";

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
    { href: "/admin/audit", label: "Audit" },
    { href: "/admin/system", label: "Sistem" },
  ];

  return (
    <main className="relative min-h-screen bg-slate-50">
      <header className="relative z-20 border-b bg-slate-900 text-white">
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
                width={40}
                height={40}
                className="h-9 w-9 max-w-full rounded-md bg-white object-contain p-0.5 sm:h-10 sm:w-10"
              />
              <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-900 sm:px-2 sm:text-[10px]">
                Admin
              </span>
            </Link>

            {/* Desktop nav (di tengah) */}
            <nav className="hidden flex-1 items-center justify-center gap-1 overflow-x-auto sm:flex">
              <DesktopNavLinks items={nav} variant="dark" />
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {/* Hamburger menu di mobile - gantikan horizontal-scroll nav
                  yang trigger iOS Safari overflow */}
              <div className="sm:hidden">
                <MobileNavMenu items={nav} />
              </div>
              <UserMenu
                label={user.username ?? user.name.split(" ")[0]}
                summaryClassName="block max-w-[110px] truncate rounded-full bg-slate-700 px-3 py-1.5 text-sm font-medium text-white sm:max-w-none"
                subtitle="Masuk sebagai Administrator"
                items={[
                  {
                    type: "link",
                    href: "/admin/account",
                    label: "Akun & ganti password",
                  },
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
