"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

/**
 * Cek aktif untuk item navigasi: cocok kalau pathname sama persis, ATAU
 * pathname adalah child path (mis. /kos/abc → "/kos" aktif). Saat banyak
 * item cocok (misal /admin & /admin/users keduanya prefix dari
 * /admin/users), yang menang adalah href TERPANJANG — supaya nav anak
 * yang lebih spesifik di-highlight bukan dashboard root-nya.
 */
export function isActiveNav(
  href: string,
  pathname: string,
  allHrefs: readonly string[]
): boolean {
  const matches = (h: string) =>
    pathname === h || pathname.startsWith(h + "/");
  if (!matches(href)) return false;
  for (const other of allHrefs) {
    if (other === href) continue;
    if (other.length > href.length && matches(other)) return false;
  }
  return true;
}

/**
 * Daftar link nav untuk desktop header. Mengandalkan usePathname()
 * supaya state "aktif" sinkron dengan navigasi client-side tanpa
 * me-re-render seluruh Shell.
 *
 * variant "light" = header putih (tenant/owner shell).
 * variant "dark"  = header slate-900 (admin shell).
 */
export function DesktopNavLinks({
  items,
  variant = "light",
}: {
  items: NavItem[];
  variant?: "light" | "dark";
}) {
  const pathname = usePathname() ?? "";
  const allHrefs = items.map((i) => i.href);

  return (
    <>
      {items.map((n) => {
        const active = isActiveNav(n.href, pathname, allHrefs);
        const baseCls = "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap inline-flex items-center gap-1 transition-colors";
        const idleCls =
          variant === "dark"
            ? "text-slate-100 hover:bg-slate-800"
            : "text-slate-700 hover:bg-slate-100";
        const activeCls =
          variant === "dark"
            ? "bg-slate-700 text-white shadow-inner"
            : "bg-brand-50 text-brand-700 shadow-inner";
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`${baseCls} ${active ? activeCls : idleCls}`}
          >
            <span>{n.label}</span>
            {n.badge ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900">
                {n.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
