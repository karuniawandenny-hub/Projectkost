"use client";

import { useFormState, useFormStatus } from "react-dom";
import { adminResetPassword, type ResetUserPasswordState } from "../../../actions";

const initial: ResetUserPasswordState = {};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="btn-primary"
    >
      {pending ? "Menyimpan…" : "Simpan password baru"}
    </button>
  );
}

export function ResetPasswordForm({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
  const [state, formAction] = useFormState(adminResetPassword, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex-1 min-w-[200px]">
        <label className="label">Password baru (min 8 karakter)</label>
        <input
          name="password"
          type="text"
          minLength={8}
          required
          className="input"
          autoComplete="off"
          disabled={disabled}
        />
      </div>
      <SubmitButton disabled={disabled} />
      {state?.error && (
        <div className="basis-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      {state?.successPassword && (
        <div className="basis-full rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Password berhasil diubah. Password baru: <code>{state.successPassword}</code>
        </div>
      )}
    </form>
  );
}
