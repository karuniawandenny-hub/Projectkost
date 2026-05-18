"use client";

import { useState } from "react";

export function CheckoutButton({ paymentId }: { paymentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${paymentId}/checkout`, {
        method: "POST",
      });
      const json: { ok?: boolean; redirectUrl?: string; error?: string } =
        await res.json();
      if (!res.ok || !json.redirectUrl) {
        setError(json.error ?? "Gagal memulai pembayaran");
        return;
      }
      // Open the gateway URL in same tab.
      window.location.href = json.redirectUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal terhubung ke gateway");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={go} className="btn-success text-xs" disabled={loading}>
        {loading ? "Memuat…" : "Bayar online"}
      </button>
      {error && (
        <div className="text-xs text-red-700 mt-1 break-words max-w-[200px]">
          {error}
        </div>
      )}
    </>
  );
}
