"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useEffect } from "react";
import { createRoom, type RoomState } from "../actions";

const initial: RoomState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Menyimpan…" : "Tambah kamar"}
    </button>
  );
}

export function CreateRoomForm({ kosId }: { kosId: string }) {
  const [state, formAction] = useFormState(createRoom, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form setelah berhasil submit.
  useEffect(() => {
    if (!state.error && formRef.current) {
      // Heuristic: jika tidak ada error setelah submit, reset.
      formRef.current.reset();
    }
  }, [state]);

  return (
    <form action={formAction} ref={formRef} className="space-y-3">
      <input type="hidden" name="kosId" value={kosId} />
      <div>
        <label className="label" htmlFor="name">
          Nama/nomor kamar
        </label>
        <input id="name" name="name" className="input" placeholder="A1, 101, dll" required />
      </div>
      <div>
        <label className="label" htmlFor="monthlyPrice">
          Harga / bulan (Rp)
        </label>
        <input
          id="monthlyPrice"
          name="monthlyPrice"
          className="input"
          inputMode="numeric"
          placeholder="1500000"
          required
        />
      </div>
      {state.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
