"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { updateRoom, type UpdateRoomState } from "../actions";

const initial: UpdateRoomState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Menyimpan…" : "Simpan"}
    </button>
  );
}

type Props = {
  room: { id: string; name: string; monthlyPrice: number };
};

export function EditRoomForm({ room }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(updateRoom, initial);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 grid gap-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <input type="hidden" name="id" value={room.id} />
      <div>
        <label className="label">Nama/nomor kamar</label>
        <input
          name="name"
          className="input"
          defaultValue={room.name}
          required
          minLength={1}
        />
      </div>
      <div>
        <label className="label">Harga / bulan (Rp)</label>
        <input
          name="monthlyPrice"
          className="input"
          defaultValue={room.monthlyPrice}
          inputMode="numeric"
          required
        />
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
      {state?.error && (
        <div className="sm:col-span-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      {state?.success && (
        <div className="sm:col-span-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Perubahan tersimpan.
        </div>
      )}
    </form>
  );
}
