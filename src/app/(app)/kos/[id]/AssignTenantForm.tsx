"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { assignTenant, type AssignState } from "../actions";

const initial: AssignState = {};

export type AvailableTenant = {
  id: string;
  name: string;
  email: string;
  onboarded: boolean;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn-primary"
      type="submit"
      disabled={pending || disabled}
    >
      {pending ? "Memproses…" : "Assign ke kamar ini"}
    </button>
  );
}

export function AssignTenantForm({
  roomId,
  tenants,
}: {
  roomId: string;
  tenants: AvailableTenant[];
}) {
  const [state, formAction] = useFormState(assignTenant, initial);
  const empty = tenants.length === 0;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="roomId" value={roomId} />
      <div className="flex-1 min-w-[220px]">
        <label className="label">Pilih penghuni</label>
        <select
          name="tenantId"
          className="input"
          required
          defaultValue=""
          disabled={empty}
        >
          <option value="" disabled>
            {empty
              ? "Belum ada penghuni siap di-assign"
              : `Pilih dari ${tenants.length} penghuni…`}
          </option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.email}
              {t.onboarded ? "" : " (belum onboarding)"}
            </option>
          ))}
        </select>
        {empty && (
          <p className="mt-1 text-xs text-slate-500">
            Setujui calon penghuni dulu di{" "}
            <Link
              href="/tenants"
              className="font-medium text-brand-700 hover:underline"
            >
              halaman Penghuni
            </Link>{" "}
            agar muncul di sini.
          </p>
        )}
      </div>
      <SubmitButton disabled={empty} />
      {state?.error && (
        <div className="basis-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      {state?.success && (
        <div className="basis-full rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state?.success}
        </div>
      )}
    </form>
  );
}
