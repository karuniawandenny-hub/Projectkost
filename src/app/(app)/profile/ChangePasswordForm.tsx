"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateOwnPassword, type UpdatePasswordState } from "./actions";

const initial: UpdatePasswordState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Menyimpan…" : "Ubah password"}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(updateOwnPassword, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label" htmlFor="pw-current">
          Password saat ini <span className="text-red-500">*</span>
        </label>
        <input
          id="pw-current"
          name="currentPassword"
          type="password"
          className="input"
          required
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="label" htmlFor="pw-new">
          Password baru <span className="text-red-500">*</span>
        </label>
        <input
          id="pw-new"
          name="newPassword"
          type="password"
          className="input"
          minLength={4}
          required
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-slate-500">Minimal 4 karakter.</p>
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">
          Konfirmasi password baru <span className="text-red-500">*</span>
        </label>
        <input
          id="pw-confirm"
          name="confirm"
          type="password"
          className="input"
          minLength={4}
          required
          autoComplete="new-password"
        />
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
