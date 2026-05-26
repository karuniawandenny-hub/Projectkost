"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Tombol refresh halaman /register/pending. Untuk user logged-in
 * PENDING yang ingin cek apakah status sudah berubah jadi ACTIVE.
 * Pakai router.refresh() supaya re-fetch server-side state tanpa
 * full reload.
 */
export function CheckStatusButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      className="btn-secondary inline-flex items-center gap-1.5"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
      {pending ? "Mengecek…" : "Cek status persetujuan"}
    </button>
  );
}
