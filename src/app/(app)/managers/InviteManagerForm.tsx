"use client";

import { useFormState, useFormStatus } from "react-dom";
import { inviteManager, type InviteState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary disabled:opacity-60"
    >
      {pending ? "Mengirim…" : "Kirim undangan"}
    </button>
  );
}

export function InviteManagerForm() {
  const [state, formAction] = useFormState<InviteState, FormData>(
    inviteManager,
    {}
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="invite-email">
            Email calon pengelola
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className="input h-10 text-[16px]"
            placeholder="pengelola@example.com"
            autoComplete="off"
          />
        </div>
        <SubmitButton />
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
          {state.devLink && (
            <div className="mt-1 text-xs">
              (Mode dev) Link:{" "}
              <a
                href={state.devLink}
                className="font-mono text-brand-700 underline break-all"
              >
                {state.devLink}
              </a>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
