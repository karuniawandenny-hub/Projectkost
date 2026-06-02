"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  setMaintenanceStatus,
  type MaintActionState,
} from "../actions";

const initial: MaintActionState = {};

function Btn({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "..." : label}
    </button>
  );
}

export function SimpleActionButton({
  id,
  status,
  label,
  className,
  confirm,
}: {
  id: string;
  status: "IN_PROGRESS" | "CANCELLED";
  label: string;
  className: string;
  confirm?: string;
}) {
  const [state, formAction] = useFormState(setMaintenanceStatus, initial);
  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Btn label={label} className={className} />
    </form>
  );
}
