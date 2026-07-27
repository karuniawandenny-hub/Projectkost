"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { uploadTenantDocs, type UploadTenantDocsState } from "./actions";
import { CameraInput } from "@/components/CameraInput";

const initial: UploadTenantDocsState = {};

type Tenant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  ktpPhotoUrl: string | null;
  selfiePhotoUrl: string | null;
  createdAt: string;
};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Mengunggah…" : "Simpan dokumen"}
    </button>
  );
}

/**
 * Kartu ringkas untuk penghuni yang sudah register tapi belum melengkapi
 * onboarding (KTP + selfie). Owner TIDAK BISA assign mereka dulu — cukup
 * disini owner bisa:
 * 1. Melihat kontak untuk mengingatkan (WhatsApp/email).
 * 2. Upload dokumen atas nama penghuni kalau perlu.
 *
 * Setelah dokumen lengkap, penghuni akan pindah ke section utama
 * "Pengajuan menunggu" di reload berikutnya.
 */
export function IncompleteRegistrationCard({ tenant }: { tenant: Tenant }) {
  const [state, formAction] = useFormState(uploadTenantDocs, initial);
  const [showUpload, setShowUpload] = useState(false);

  const missing: string[] = [];
  if (!tenant.ktpPhotoUrl) missing.push("KTP");
  if (!tenant.selfiePhotoUrl) missing.push("foto diri");

  const waLink = tenant.phone
    ? `https://wa.me/${tenant.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
        `Halo ${tenant.name}, Anda sudah daftar di aplikasi kos tapi belum melengkapi upload ${missing.join(" & ")}. Silakan login kembali dan selesaikan onboarding-nya ya. Terima kasih.`
      )}`
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800">{tenant.name}</span>
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
              {missing.join(" & ")} belum diupload
            </span>
          </div>
          <div className="text-xs text-slate-500">{tenant.email}</div>
          {tenant.phone && (
            <div className="text-xs text-slate-500">{tenant.phone}</div>
          )}
          <div className="text-xs text-slate-400 mt-0.5">
            Daftar:{" "}
            {new Date(tenant.createdAt).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              💬 Ingatkan via WA
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            className="btn-primary text-xs"
          >
            {showUpload ? "Tutup" : "Upload dokumen"}
          </button>
        </div>
      </div>

      {showUpload && (
        <form
          action={formAction}
          className="mt-3 space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-3"
        >
          <div className="text-xs text-slate-600">
            Upload dokumen atas nama penghuni. Setelah lengkap, kartu ini akan
            pindah ke antrean utama "Pengajuan menunggu" agar bisa Anda setujui.
          </div>
          <input type="hidden" name="userId" value={tenant.id} />
          {!tenant.ktpPhotoUrl && (
            <CameraInput
              name="ktp"
              label="Foto / scan KTP"
              capture="environment"
              helper="Pastikan teks pada KTP jelas terbaca. Format: JPG/PNG/PDF, maks 8 MB."
            />
          )}
          {!tenant.selfiePhotoUrl && (
            <CameraInput
              name="selfie"
              label="Foto diri penghuni"
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
          <SubmitBtn />
        </form>
      )}
    </div>
  );
}
