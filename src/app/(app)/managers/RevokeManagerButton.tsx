"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { revokeManager, type RevokeState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-danger disabled:opacity-60 text-xs"
    >
      {pending ? "Mencabut…" : "Ya, cabut akses"}
    </button>
  );
}

export function RevokeManagerButton({
  managerId,
  managerName,
}: {
  managerId: string;
  managerName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useFormState<RevokeState, FormData>(
    revokeManager,
    {}
  );

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-red-600 hover:underline shrink-0"
      >
        Cabut akses
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5"
    >
      <input type="hidden" name="managerId" value={managerId} />
      <span className="text-xs text-red-800 whitespace-nowrap">
        Cabut akses {managerName}?
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs font-medium text-slate-600 hover:underline"
      >
        Batal
      </button>
      <SubmitButton />
      {state.error && (
        <span className="text-[10px] text-red-700">{state.error}</span>
      )}
    </form>
  );
}
