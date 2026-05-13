"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Mengirim…" : "Kirim link reset"}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(requestPasswordReset, initial);

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Lupa password</h1>
      <p className="mt-1 text-sm text-slate-600">
        Masukkan email akun Anda. Kami akan mengirim link untuk mengatur
        password baru.
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            placeholder="anda@email.com"
            required
            autoFocus
            autoComplete="email"
          />
        </div>

        {state?.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state?.error}
          </div>
        )}
        {state?.info && (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state?.info}
          </div>
        )}
        {state?.devLink && (
          <div className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Mode Pengembangan
            </div>
            <div className="mt-1 text-sm text-amber-900">
              Email tidak dikirim ke kotak masuk karena gateway belum disetel.
              Klik link di bawah untuk membuka halaman reset:
            </div>
            <a
              href={state.devLink}
              className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs text-brand-700 hover:underline"
            >
              {state.devLink}
            </a>
          </div>
        )}

        <SubmitButton />
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Ingat password Anda?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Kembali ke login
        </Link>
      </p>
    </div>
  );
}
