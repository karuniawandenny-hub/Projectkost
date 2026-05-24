"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import {
  changeOwnPassword,
  type ChangeOwnPasswordState,
} from "../../actions";

const initial: ChangeOwnPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Menyimpan…" : "Simpan password baru"}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(changeOwnPassword, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label className="label">Password lama</label>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>
      <div>
        <label className="label">Password baru (min 8 karakter)</label>
        <input
          name="newPassword"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="input"
        />
        <p className="mt-1 text-xs text-slate-500">
          Gunakan minimal 12 karakter, kombinasi huruf besar/kecil, angka, dan simbol untuk keamanan optimal.
        </p>
      </div>
      <div>
        <label className="label">Konfirmasi password baru</label>
        <input
          name="confirmPassword"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="input"
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton />
      </div>

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✅ Password berhasil diubah. Gunakan password baru pada login berikutnya.
        </div>
      )}
    </form>
  );
}
