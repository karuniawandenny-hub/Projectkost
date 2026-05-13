"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, type RegisterState } from "./actions";

const initial: RegisterState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Memproses…" : "Daftar"}
    </button>
  );
}

export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, initial);

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Daftar akun</h1>
      <p className="mt-1 text-sm text-slate-600">
        Buat akun untuk mulai mengelola atau menempati kos.
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Nama lengkap
          </label>
          <input id="name" name="name" className="input" required minLength={2} />
        </div>
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
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            required
            minLength={8}
            autoComplete="new-password"
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
        <div>
          <label className="label" htmlFor="phone">
            Nomor HP <span className="text-slate-400">(opsional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            className="input"
            placeholder="08xxxxxxxxxx"
            inputMode="tel"
          />
        </div>
        <div>
          <span className="label">Saya adalah</span>
          <div className="grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-3 text-center text-sm hover:bg-slate-50 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="role" value="OWNER" className="sr-only" required />
              Pemilik kos
            </label>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-3 text-center text-sm hover:bg-slate-50 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="role" value="TENANT" className="sr-only" />
              Penghuni
            </label>
          </div>
        </div>

        {state?.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state?.error}
          </div>
        )}

        <SubmitButton />
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
