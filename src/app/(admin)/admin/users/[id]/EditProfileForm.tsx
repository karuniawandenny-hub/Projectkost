"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  updateUserProfile,
  type UpdateProfileState,
} from "../../../actions";

const initial: UpdateProfileState = {};

function SubmitBtn({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-primary"
      disabled={pending || disabled}
    >
      {pending ? "Menyimpan…" : "Simpan perubahan"}
    </button>
  );
}

export function EditProfileForm({
  userId,
  defaults,
  disabled,
}: {
  userId: string;
  defaults: {
    name: string;
    email: string;
    phone: string | null;
    username: string | null;
  };
  disabled?: boolean;
}) {
  const [state, formAction] = useFormState(updateUserProfile, initial);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="label" htmlFor="name">
          Nama lengkap
        </label>
        <input
          id="name"
          name="name"
          defaultValue={defaults.name}
          className="input"
          disabled={disabled}
        />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={defaults.email}
          className="input"
          disabled={disabled}
        />
      </div>
      <div>
        <label className="label" htmlFor="phone">
          Nomor HP
        </label>
        <input
          id="phone"
          name="phone"
          defaultValue={defaults.phone ?? ""}
          className="input"
          placeholder="08xxxxxxxxxx"
          inputMode="tel"
          disabled={disabled}
        />
        <p className="mt-1 text-xs text-slate-500">
          Akan dinormalisasi otomatis (contoh: 08111689789 → +628111689789).
        </p>
      </div>
      <div>
        <label className="label" htmlFor="username">
          Username{" "}
          <span className="text-xs font-normal text-slate-500">(opsional)</span>
        </label>
        <input
          id="username"
          name="username"
          defaultValue={defaults.username ?? ""}
          className="input"
          placeholder="Kosongkan / isi '-' untuk hapus"
          disabled={disabled}
        />
        <p className="mt-1 text-xs text-slate-500">
          Isi <code>-</code> (satu strip) untuk hapus username. Kosong = tidak
          diubah.
        </p>
      </div>

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </div>
      )}

      <SubmitBtn disabled={disabled} />
    </form>
  );
}
