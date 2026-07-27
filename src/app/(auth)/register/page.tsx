"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, type RegisterState } from "./actions";
import { CameraInput } from "@/components/CameraInput";

const initial: RegisterState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Memproses…" : label}
    </button>
  );
}

export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, initial);
  const [role, setRole] = useState<"OWNER" | "TENANT" | "">("");

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Daftar akun</h1>
      <p className="mt-1 text-sm text-slate-600">
        Buat akun untuk mulai mengelola atau menempati kos.
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        {/* Role pertama — ini menentukan field lain yang muncul. */}
        <div>
          <span className="label">Saya adalah</span>
          <div className="grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-3 text-center text-sm hover:bg-slate-50 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input
                type="radio"
                name="role"
                value="OWNER"
                className="sr-only"
                required
                onChange={() => setRole("OWNER")}
              />
              Pemilik kos
            </label>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-3 text-center text-sm hover:bg-slate-50 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input
                type="radio"
                name="role"
                value="TENANT"
                className="sr-only"
                onChange={() => setRole("TENANT")}
              />
              Penghuni
            </label>
          </div>
        </div>

        {/* Peringatan tegas begitu user pilih penghuni. */}
        {role === "TENANT" && (
          <div className="rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <div className="font-semibold">
              ⚠️ Wajib untuk pendaftaran penghuni
            </div>
            <div className="mt-1">
              Foto KTP &amp; foto diri (selfie) <strong>wajib diupload di
              halaman ini</strong>. Tanpa kedua foto tersebut, akun tidak akan
              dibuat. Siapkan KTP fisik Anda di dekat kamera sebelum lanjut.
            </div>
          </div>
        )}

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
            Nomor HP <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            className="input"
            placeholder="08xxxxxxxxxx"
            inputMode="tel"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Wajib diisi untuk menerima reminder pembayaran via WhatsApp.
          </p>
        </div>

        {/* Field KTP + selfie — mount hanya kalau role=TENANT.
            required diset supaya browser blokir submit tanpa file. */}
        {role === "TENANT" && (
          <>
            <div className="border-t border-slate-200 pt-4">
              <h2 className="text-sm font-semibold text-slate-800">
                Dokumen identitas
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Data ini hanya bisa dilihat oleh pemilik kos tempat Anda
                menginap dan administrator sistem.
              </p>
            </div>
            <CameraInput
              name="ktp"
              required
              label="Foto / scan KTP"
              capture="environment"
              helper="Pastikan teks pada KTP jelas terbaca, 4 sudut terlihat. Format: JPG/PNG/PDF, maks 8 MB."
            />
            <CameraInput
              name="selfie"
              required
              label="Foto diri (selfie)"
              capture="user"
              helper="Foto wajah Anda dengan pencahayaan baik, tanpa masker."
            />
          </>
        )}

        {state?.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state?.error}
          </div>
        )}

        <SubmitButton
          label={role === "TENANT" ? "Daftar & kirim dokumen" : "Daftar"}
        />
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
