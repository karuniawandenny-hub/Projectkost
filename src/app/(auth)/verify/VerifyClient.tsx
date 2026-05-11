"use client";

import { useFormState, useFormStatus } from "react-dom";
import { verifyAction, resendOtpAction, type VerifyState } from "./actions";
import { useState } from "react";

const initial: VerifyState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Memverifikasi…" : "Verifikasi"}
    </button>
  );
}

type Props = {
  phone: string;
  devMode: boolean;
  initialDevOtp?: string;
};

export function VerifyClient({ phone, devMode, initialDevOtp }: Props) {
  const [state, formAction] = useFormState(verifyAction, initial);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | undefined>(initialDevOtp);
  const [resending, setResending] = useState(false);

  async function handleResend(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setResending(true);
    setResendInfo(null);
    setResendError(null);
    const fd = new FormData();
    fd.set("phone", phone);
    const res = await resendOtpAction(fd);
    setResending(false);
    if (res.error) {
      setResendError(res.error);
    } else {
      setResendInfo(res.info ?? "OTP telah dikirim ulang.");
      if (res.devOtp) setDevOtp(res.devOtp);
    }
  }

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Masukkan kode OTP</h1>
      <p className="mt-1 text-sm text-slate-600">
        Kode 6 digit dikirim ke <span className="font-medium">{phone}</span>.
        Berlaku 5 menit.
      </p>

      {devMode && devOtp && (
        <div className="mt-4 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Mode Pengembangan
          </div>
          <div className="mt-1 text-sm text-amber-900">
            OTP tidak dikirim ke WhatsApp/SMS karena gateway belum disetel.
            Gunakan kode di bawah untuk testing:
          </div>
          <div className="mt-3 select-all text-center font-mono text-3xl font-bold tracking-[0.4em] text-amber-900">
            {devOtp}
          </div>
          <div className="mt-2 text-xs text-amber-700">
            Untuk benar-benar mengirim ke nomor HP, setel <code>OTP_MODE=fonnte</code> +{" "}
            <code>WA_GATEWAY_TOKEN</code> di <code>.env</code> (lihat README).
          </div>
        </div>
      )}

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
            defaultValue={devMode ? devOtp ?? "" : ""}
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
        {resendError && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {resendError}
          </div>
        )}
        <SubmitButton />
      </form>

      <button
        onClick={handleResend}
        disabled={resending}
        className="mt-4 w-full text-sm text-brand-700 hover:underline disabled:opacity-50"
      >
        {resending ? "Mengirim ulang…" : "Kirim ulang OTP"}
      </button>

      {!devMode && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Tidak menerima OTP? Cek WhatsApp/SMS Anda, atau klik "Kirim ulang OTP".
        </p>
      )}
    </div>
  );
}
