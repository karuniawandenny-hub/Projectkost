"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Mengirim OTP…" : "Kirim OTP"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initial);

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Masuk</h1>
      <p className="mt-1 text-sm text-slate-600">
        Masukkan nomor HP yang terdaftar. Kami akan mengirim OTP.
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="phone">
            Nomor HP
          </label>
          <input
            id="phone"
            name="phone"
            className="input"
            placeholder="08xxxxxxxxxx"
            required
            inputMode="tel"
            autoFocus
          />
        </div>
        {state.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}
        <SubmitButton />
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Belum punya akun?{" "}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Daftar
        </Link>
      </p>
    </div>
  );
}
