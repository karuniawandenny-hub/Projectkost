"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateOwnEmail, type UpdateEmailState } from "./actions";

const initial: UpdateEmailState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Menyimpan…" : "Ubah email"}
    </button>
  );
}

export function ChangeEmailForm({
  currentEmail,
}: {
  currentEmail: string | null;
}) {
  const [state, formAction] = useFormState(updateOwnEmail, initial);

  // Deteksi email fiktif (dari fitur register-by-owner) supaya kita
  // bisa kasih hint jelas kalau user perlu ganti.
  const isFakeEmail = currentEmail?.endsWith("@baitikos.local") ?? false;

  return (
    <form action={formAction} className="space-y-3">
      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <div className="text-xs font-medium text-slate-500">Email saat ini</div>
        <div className="mt-0.5 font-mono text-slate-800 break-all">
          {currentEmail ?? "(belum diset)"}
        </div>
        {isFakeEmail && (
          <p className="mt-1 text-xs text-amber-700">
            Ini email otomatis yang dibuat pemilik kos. Sarankan ganti dengan
            email pribadi Anda supaya notifikasi email bisa masuk.
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="new-email">
          Email baru <span className="text-red-500">*</span>
        </label>
        <input
          id="new-email"
          name="newEmail"
          type="email"
          className="input"
          required
          autoComplete="email"
          placeholder="anda@email.com"
        />
      </div>

      <div>
        <label className="label" htmlFor="email-pw">
          Password (konfirmasi) <span className="text-red-500">*</span>
        </label>
        <input
          id="email-pw"
          name="password"
          type="password"
          className="input"
          required
          autoComplete="current-password"
        />
        <p className="mt-1 text-xs text-slate-500">
          Password login Anda saat ini — untuk memastikan bukan orang lain
          yang mengganti email.
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
          ✅ {state.success}
        </div>
      )}
    </form>
  );
}
