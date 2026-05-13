"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { resetPasswordAction, type ResetState } from "./actions";

const initial: ResetState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Menyimpan…" : "Simpan password baru"}
    </button>
  );
}

export function ResetClient({ token }: { token: string }) {
  const [state, formAction] = useFormState(resetPasswordAction, initial);

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Buat password baru</h1>
      <p className="mt-1 text-sm text-slate-600">
        Masukkan password baru Anda di bawah ini.
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">
            Password baru
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
          <p className="mt-1 text-xs text-slate-500">Minimal 8 karakter.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            Konfirmasi password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            className="input"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {state?.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state?.error}
          </div>
        )}

        <SubmitButton />
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Kembali ke login
        </Link>
      </p>
    </div>
  );
}
