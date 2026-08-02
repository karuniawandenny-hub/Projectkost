"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Masuk…" : "Masuk"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initial);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="identifier">
          Nomor HP, email, atau username
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          className="input"
          placeholder="08xxxxxxxxxx / anda@email.com / admin"
          required
          autoFocus
          autoComplete="username"
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
          autoComplete="current-password"
        />
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
