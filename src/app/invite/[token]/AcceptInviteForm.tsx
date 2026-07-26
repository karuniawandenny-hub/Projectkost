"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  acceptManagerInvite,
  type AcceptInviteState,
} from "../../(app)/managers/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full disabled:opacity-60"
    >
      {pending ? "Memproses…" : "Terima & buat akun"}
    </button>
  );
}

export function AcceptInviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<AcceptInviteState, FormData>(
    acceptManagerInvite,
    {}
  );

  useEffect(() => {
    if (state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state.redirectTo, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      <div>
        <label className="label" htmlFor="acc-name">
          Nama lengkap
        </label>
        <input
          id="acc-name"
          name="name"
          type="text"
          required
          minLength={2}
          className="input h-10 text-[16px]"
          autoComplete="name"
          placeholder="Nama Anda"
        />
      </div>

      <div>
        <label className="label">Email</label>
        <input
          type="email"
          value={email}
          disabled
          className="input h-10 text-[16px] bg-slate-100"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Email di undangan tidak bisa diubah.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="acc-pw">
          Password baru
        </label>
        <input
          id="acc-pw"
          name="password"
          type="password"
          required
          minLength={8}
          className="input h-10 text-[16px]"
          autoComplete="new-password"
          placeholder="Min. 8 karakter"
        />
      </div>

      <div>
        <label className="label" htmlFor="acc-pw2">
          Konfirmasi password
        </label>
        <input
          id="acc-pw2"
          name="confirm"
          type="password"
          required
          minLength={8}
          className="input h-10 text-[16px]"
          autoComplete="new-password"
          placeholder="Ulangi password"
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
