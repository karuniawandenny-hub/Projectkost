"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { verifyAction, resendOtpAction, type VerifyState } from "./actions";
import { Suspense, useState } from "react";

const initial: VerifyState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Memverifikasi…" : "Verifikasi"}
    </button>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="card">Memuat…</div>}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const search = useSearchParams();
  const phone = search.get("phone") ?? "";
  const [state, formAction] = useFormState(verifyAction, initial);
  const [resendInfo, setResendInfo] = useState<string | null>(null);

  async function handleResend(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("phone", phone);
    const res = await resendOtpAction(fd);
    setResendInfo(res.info ?? res.error ?? null);
  }

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Masukkan kode OTP</h1>
      <p className="mt-1 text-sm text-slate-600">
        Kode 6 digit dikirim ke <span className="font-medium">{phone}</span>.
        Berlaku 5 menit.
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="phone" value={phone} />
        <div>
          <label className="label" htmlFor="code">
            Kode OTP
          </label>
          <input
            id="code"
            name="code"
            className="input text-center text-2xl tracking-[0.5em]"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
          />
        </div>
        {state.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}
        {resendInfo && (
          <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {resendInfo}
          </div>
        )}
        <SubmitButton />
      </form>
      <button
        onClick={handleResend}
        className="mt-4 w-full text-sm text-brand-700 hover:underline"
      >
        Kirim ulang OTP
      </button>
      <p className="mt-3 text-center text-xs text-slate-500">
        Mode dev: OTP juga tercetak di console server.
      </p>
    </div>
  );
}
