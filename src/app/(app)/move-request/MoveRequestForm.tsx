"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestMove, type MoveRequestState } from "./actions";

const initial: MoveRequestState = {};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn-primary"
    >
      {pending ? "Mengirim…" : "Ajukan pindah"}
    </button>
  );
}

export function MoveRequestForm({
  rooms,
}: {
  rooms: { id: string; label: string }[];
}) {
  const [state, formAction] = useFormState(requestMove, initial);
  const empty = rooms.length === 0;
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label">Kamar tujuan</label>
        <select
          name="toRoomId"
          className="input"
          required
          defaultValue=""
          disabled={empty}
        >
          <option value="" disabled>
            {empty
              ? "Tidak ada kamar kosong di kos ini"
              : `Pilih dari ${rooms.length} kamar kosong…`}
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Alasan (opsional)</label>
        <textarea
          name="reason"
          rows={2}
          className="input"
          placeholder="Mis. ingin lebih dekat dengan teman, kamar saat ini bising, dll."
        />
      </div>
      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state?.success}
        </div>
      )}
      <SubmitButton disabled={empty} />
    </form>
  );
}
