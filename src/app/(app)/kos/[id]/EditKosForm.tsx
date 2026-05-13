"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { updateKos, type UpdateKosState } from "../actions";

const initial: UpdateKosState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Menyimpan…" : "Simpan perubahan"}
    </button>
  );
}

type Props = {
  kos: { id: string; name: string; address: string; description: string | null };
};

export function EditKosForm({ kos }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(updateKos, initial);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary"
      >
        Edit detail
      </button>
    );
  }

  return (
    <div className="card border-brand-300 bg-brand-50/40">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Edit detail kos</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-slate-600 hover:underline"
        >
          Tutup
        </button>
      </div>
      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="id" value={kos.id} />
        <div>
          <label className="label" htmlFor="edit-name">
            Nama kos
          </label>
          <input
            id="edit-name"
            name="name"
            className="input"
            defaultValue={kos.name}
            required
            minLength={2}
          />
        </div>
        <div>
          <label className="label" htmlFor="edit-address">
            Alamat
          </label>
          <input
            id="edit-address"
            name="address"
            className="input"
            defaultValue={kos.address}
            required
            minLength={5}
          />
        </div>
        <div>
          <label className="label" htmlFor="edit-description">
            Catatan (opsional)
          </label>
          <textarea
            id="edit-description"
            name="description"
            className="input"
            rows={2}
            defaultValue={kos.description ?? ""}
          />
        </div>

        {state?.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state?.error}
          </div>
        )}
        {state?.success && (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Perubahan tersimpan.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-secondary"
          >
            Batal
          </button>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
