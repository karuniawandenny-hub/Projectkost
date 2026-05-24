"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateOwnPhone, type UpdatePhoneState } from "./actions";

const initial: UpdatePhoneState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Menyimpan…" : "Simpan"}
    </button>
  );
}

export function PhoneEditForm({ currentPhone }: { currentPhone: string | null }) {
  const [state, formAction] = useFormState(updateOwnPhone, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label" htmlFor="phone-edit">
          Nomor HP {!currentPhone && <span className="text-red-500">*</span>}
        </label>
        <input
          id="phone-edit"
          name="phone"
          className="input"
          placeholder="08xxxxxxxxxx"
          inputMode="tel"
          defaultValue={currentPhone ?? ""}
          required
        />
        <p className="mt-1 text-xs text-slate-500">
          Digunakan untuk reminder pembayaran via WhatsApp (H-7, H-3, H-1, dan
          saat terlambat).
        </p>
      </div>
      <SaveButton />
      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✅ Nomor HP berhasil disimpan.
        </div>
      )}
    </form>
  );
}
