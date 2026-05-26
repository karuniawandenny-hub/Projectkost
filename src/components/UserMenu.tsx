"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MenuItem =
  | { type: "link"; href: string; label: string }
  | { type: "form"; action: string; label: string; variant?: "danger" };

type Props = {
  label: string;
  summaryClassName: string;
  subtitle?: string;
  items: MenuItem[];
};

/**
 * Dropdown user menu yang terkontrol via useState (bukan <details>).
 * <details> di iOS Safari punya bug: tap di item dropdown sering
 * trigger close <details> dulu sebelum click sampai ke link/button -
 * sehingga item tidak bisa diklik.
 */
export function UserMenu({ label, summaryClassName, subtitle, items }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("click", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={summaryClassName}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 text-slate-900 shadow-lg"
        >
          {subtitle && (
            <div className="px-3 py-2 text-xs text-slate-500">{subtitle}</div>
          )}
          {items.map((item, idx) =>
            item.type === "link" ? (
              <Link
                key={idx}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ) : (
              <form key={idx} action={item.action} method="POST">
                <button
                  type="submit"
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                    item.variant === "danger"
                      ? "text-red-600 hover:bg-red-50"
                      : "text-slate-700"
                  }`}
                >
                  {item.label}
                </button>
              </form>
            )
          )}
        </div>
      )}
    </div>
  );
}
