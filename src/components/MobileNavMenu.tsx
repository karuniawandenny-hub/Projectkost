"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type NavItem = { href: string; label: string; badge?: number };

type Props = {
  items: NavItem[];
  buttonClassName?: string;
};

/**
 * Hamburger menu untuk mobile - menggantikan horizontal-scroll nav
 * yang bermasalah di iOS Safari (kadang push parent width walau ada
 * overflow-x: auto + min-w-0). Dengan overlay full-screen, tidak ada
 * kemungkinan element nav menyebabkan horizontal overflow di page.
 */
export function MobileNavMenu({ items, buttonClassName }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu navigasi"
        className={
          buttonClassName ??
          "inline-flex h-9 w-9 items-center justify-center rounded-md text-current hover:bg-white/10"
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
