"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  updateTenancyStartDate,
  type UpdateStartDateState,
} from "./actions";

const initial: UpdateStartDateState = {};

function isoDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Menyimpan…" : "Simpan"}
    </button>
  );
}

export function EditStartDateForm({
  tenancyId,
  currentStartDate,
}: {
  tenancyId: string;
  currentStartDate: string; // ISO string dari serialisasi Server Component
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(updateTenancyStartDate, initial);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary"
      >
        Ubah tanggal mulai
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="basis-full mt-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
    >
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Tanggal mulai sewa baru</label>
          <input
            type="date"
            name="startDate"
            className="input"
            required
            defaultValue={isoDate(new Date(currentStartDate))}
          />
          <p className="mt-1 text-xs text-slate-500">
            Jatuh tempo bulanan otomatis mengikuti tanggal ini.
          </p>
        </div>
        <div className="flex gap-2">
          <SubmitButton />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-secondary"
          >
            Batal
          </button>
        </div>
      </div>
      {state?.error && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      {state?.success && (
        <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state?.success}
        </div>
      )}
    </form>
  );
}
