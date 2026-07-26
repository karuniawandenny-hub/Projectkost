"use client";

import { useFormState, useFormStatus } from "react-dom";
import { cancelInvite, type CancelInviteState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium text-slate-600 hover:text-red-700 hover:underline"
    >
      {pending ? "Membatalkan…" : "Batalkan"}
    </button>
  );
}

export function CancelInviteButton({ id }: { id: string }) {
  const [, formAction] = useFormState<CancelInviteState, FormData>(
    cancelInvite,
    {}
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="inviteId" value={id} />
      <SubmitButton />
    </form>
  );
}
