"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createKos, type KosState } from "./actions";

const initial: KosState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Menyimpan…" : "Simpan kos"}
    </button>
  );
}

export function CreateKosForm() {
  const [state, formAction] = useFormState(createKos, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label" htmlFor="name">
          Nama kos
        </label>
        <input id="name" name="name" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="address">
          Alamat
        </label>
        <input id="address" name="address" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Catatan (opsional)
        </label>
        <textarea id="description" name="description" className="input" rows={2} />
      </div>
      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
