"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  completeMaintenance,
  type MaintActionState,
} from "../actions";

const initial: MaintActionState = {};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-success" disabled={pending}>
      {pending ? "Menyimpan…" : "Tandai selesai"}
    </button>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CompleteForm({ id }: { id: string }) {
  const [state, formAction] = useFormState(completeMaintenance, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Tanggal selesai</label>
          <input
            type="date"
            name="completedDate"
            className="input"
            defaultValue={todayISO()}
            required
          />
        </div>
        <div>
          <label className="label">Biaya (Rp, opsional)</label>
          <input
            name="cost"
            inputMode="numeric"
            className="input"
            placeholder="Mis. 150000"
          />
        </div>
      </div>
      <div>
        <label className="label">Vendor / tukang (opsional)</label>
        <input
          name="vendor"
          className="input"
          placeholder="Mis. Pak Joko (CV ABC)"
        />
      </div>
      <div>
        <label className="label">Catatan (opsional)</label>
        <textarea name="notes" className="input" rows={2} />
      </div>
      <div>
        <label className="label">Foto bukti (max 6)</label>
        <input
          type="file"
          name="photos"
          multiple
          accept="image/*"
          className="input"
        />
      </div>
      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}
