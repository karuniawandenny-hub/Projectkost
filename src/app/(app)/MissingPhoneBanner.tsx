"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateOwnPhone, type UpdatePhoneState } from "./profile/actions";

const initial: UpdatePhoneState = {};

function SaveButton({ small }: { small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={small ? "btn-primary text-xs" : "btn-primary"}
    >
      {pending ? "Menyimpan…" : "Simpan nomor HP"}
    </button>
  );
}

/**
 * Banner peringatan: tampil di dashboard tenant kalau phone null.
 * Compact form di-embed langsung — tidak perlu navigate ke profile.
 */
export function MissingPhoneBanner() {
  const [state, formAction] = useFormState(updateOwnPhone, initial);

  if (state?.success) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        ✅ Nomor HP berhasil disimpan. Anda akan menerima reminder pembayaran
        via WhatsApp mulai sekarang.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl" aria-hidden>📱</div>
        <div className="flex-1">
          <div className="font-semibold text-amber-900">
            Lengkapi nomor HP Anda
          </div>
          <p className="mt-1 text-sm text-amber-800">
            Nomor HP belum terdaftar. Tanpa nomor HP, Anda tidak akan menerima
            <strong> reminder pembayaran via WhatsApp</strong> (H-7, H-3, H-1,
            dan saat tagihan terlambat).
          </p>
          <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="label" htmlFor="phone-banner">
                Nomor HP
              </label>
              <input
                id="phone-banner"
                name="phone"
                className="input"
                placeholder="08xxxxxxxxxx"
                inputMode="tel"
                required
              />
            </div>
            <SaveButton small />
          </form>
          {state?.error && (
            <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
