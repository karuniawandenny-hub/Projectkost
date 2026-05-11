"use client";

import { useFormState, useFormStatus } from "react-dom";
import { assignTenant, type AssignState } from "../actions";

const initial: AssignState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-secondary" type="submit" disabled={pending}>
      {pending ? "Memproses…" : "Assign penghuni"}
    </button>
  );
}

export function AssignTenantForm({ roomId }: { roomId: string }) {
  const [state, formAction] = useFormState(assignTenant, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="roomId" value={roomId} />
      <div className="flex-1 min-w-[200px]">
        <label className="label">Email penghuni</label>
        <input
          name="tenantEmail"
          type="email"
          className="input"
          placeholder="penghuni@email.com"
          required
        />
      </div>
      <SubmitButton />
      {state.error && (
        <div className="basis-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
    </form>
  );
}
