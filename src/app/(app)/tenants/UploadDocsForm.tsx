"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { uploadTenantDocs, type UploadTenantDocsState } from "./actions";
import { CameraInput } from "@/components/CameraInput";

const initial: UploadTenantDocsState = {};

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "Mengunggah…" : label}
    </button>
  );
}

/**
 * Form upload dokumen (KTP + selfie) atas nama penghuni AKTIF.
 * Toggle-able: default tersembunyi, muncul dengan tombol.
 *
 * Berbeda dari onboarding penghuni sendiri:
 * - Hanya field yang belum ada yang wajib.
 * - Sudah punya salah satu → hanya perlu upload yang kurang.
 * - Bisa replace kalau owner pilih tampilkan semua.
 */
export function UploadDocsForm({
  userId,
  hasKtp,
  hasSelfie,
  tenantName,
}: {
  userId: string;
  hasKtp: boolean;
  hasSelfie: boolean;
  tenantName: string;
}) {
  const [state, formAction] = useFormState(uploadTenantDocs, initial);
  const [open, setOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);

  const missing = !hasKtp || !hasSelfie;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          missing
            ? "btn-primary border-amber-500 bg-amber-500 hover:bg-amber-600"
            : "btn-secondary"
        }
      >
        {missing ? "⚠️ Upload dokumen kurang" : "Ganti dokumen"}
      </button>
    );
  }

  const showKtpField = !hasKtp || replaceMode;
  const showSelfieField = !hasSelfie || replaceMode;

  return (
    <div className="w-full rounded-lg border border-brand-200 bg-brand-50/50 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">
            Upload dokumen untuk {tenantName}
          </div>
          <div className="text-xs text-slate-600">
            Pastikan Anda punya izin dari penghuni untuk mengupload identitasnya.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-slate-500 hover:text-slate-700"
          aria-label="Tutup"
        >
          ✕
        </button>
      </div>

      {!missing && (
        <label className="mb-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={replaceMode}
            onChange={(e) => setReplaceMode(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Ganti dokumen yang sudah ada (file lama akan dihapus)</span>
        </label>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="userId" value={userId} />
        {showKtpField && (
          <CameraInput
            name="ktp"
            label={hasKtp ? "Ganti foto KTP" : "Foto / scan KTP"}
            capture="environment"
            helper="Pastikan teks pada KTP jelas terbaca. Format: JPG/PNG/PDF, maks 8 MB."
          />
        )}
        {showSelfieField && (
          <CameraInput
            name="selfie"
            label={hasSelfie ? "Ganti foto diri" : "Foto diri penghuni"}
            capture="environment"
            helper="Boleh foto langsung di tempat, atau kirim ulang dari HP penghuni."
          />
        )}

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

        <SubmitBtn label="Simpan dokumen" />
      </form>
    </div>
  );
}
