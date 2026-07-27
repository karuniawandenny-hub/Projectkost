"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState } from "react";
import {
  approveAndAssignTenant,
  rejectTenant,
  uploadTenantDocs,
  type ApproveTenantState,
  type UploadTenantDocsState,
} from "./actions";
import { viewerUrl } from "@/lib/viewer";
import { CameraInput } from "@/components/CameraInput";

const initial: ApproveTenantState = {};
const initialUpload: UploadTenantDocsState = {};

type Tenant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  ktpPhotoUrl: string | null;
  selfiePhotoUrl: string | null;
  onboardedAt: string | null;
  createdAt: string;
};

export type KosOption = {
  id: string;
  name: string;
  rooms: { id: string; name: string; monthlyPrice: number }[];
};

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function ApproveButton({
  label,
  disabled,
}: {
  label: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-success"
      disabled={pending || disabled}
    >
      {pending ? "Memproses…" : label}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-danger" disabled={pending}>
      {pending ? "Memproses…" : "Tolak"}
    </button>
  );
}

function UploadDocsButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Mengunggah…" : "Simpan dokumen"}
    </button>
  );
}

export function PendingTenantCard({
  tenant,
  kosOptions,
}: {
  tenant: Tenant;
  kosOptions: KosOption[];
}) {
  const [assignState, assignAction] = useFormState(
    approveAndAssignTenant,
    initial
  );
  const [rejectState, rejectActionForm] = useFormState(rejectTenant, initial);
  const [uploadState, uploadAction] = useFormState(
    uploadTenantDocs,
    initialUpload
  );

  const [selectedKosId, setSelectedKosId] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const rooms = useMemo(() => {
    const k = kosOptions.find((x) => x.id === selectedKosId);
    return k?.rooms ?? [];
  }, [selectedKosId, kosOptions]);

  const onboarded = !!tenant.onboardedAt;
  const hasKtp = !!tenant.ktpPhotoUrl;
  const hasSelfie = !!tenant.selfiePhotoUrl;
  const docsComplete = hasKtp && hasSelfie;
  const hasAnyAvailable = kosOptions.some((k) => k.rooms.length > 0);

  return (
    <div className="card">
      <div className="flex items-start gap-4 flex-wrap">
        {tenant.selfiePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.selfiePhotoUrl}
            alt={tenant.name}
            className="h-20 w-20 rounded-full object-cover border"
          />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-200 text-2xl font-bold text-slate-600">
            {tenant.name.slice(0, 1)}
          </div>
        )}
        <div className="flex-1 min-w-[220px]">
          <div className="font-semibold">{tenant.name}</div>
          <div className="text-sm text-slate-600">{tenant.email}</div>
          {tenant.phone && (
            <div className="text-xs text-slate-500">{tenant.phone}</div>
          )}
          <div className="text-xs text-slate-500 mt-1">
            Daftar:{" "}
            {new Date(tenant.createdAt).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {onboarded ? (
              <span className="badge-green">Onboarding selesai</span>
            ) : (
              <span className="badge-yellow">Belum onboarding</span>
            )}
          </div>
        </div>
      </div>

      {/* ==== Panel Dokumen Identitas ==== */}
      <div
        className={`mt-4 rounded-lg border p-3 ${
          docsComplete
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-amber-300 bg-amber-50"
        }`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              Dokumen identitas
            </div>
            <div className="text-xs text-slate-600">
              {docsComplete
                ? "KTP & foto diri sudah lengkap. Anda bisa langsung menyetujui."
                : "KTP & foto diri wajib ada sebelum menyetujui penghuni."}
            </div>
          </div>
          {!docsComplete && (
            <button
              type="button"
              onClick={() => setShowUpload((v) => !v)}
              className="text-xs font-medium text-brand-700 underline"
            >
              {showUpload ? "Tutup upload" : "Upload atas nama penghuni →"}
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <DocStatus
            label="Foto KTP"
            url={tenant.ktpPhotoUrl}
            viewerLabel="Foto KTP"
          />
          <DocStatus
            label="Foto diri"
            url={tenant.selfiePhotoUrl}
            viewerLabel="Foto Diri"
          />
        </div>

        {showUpload && (
          <form
            action={uploadAction}
            className="mt-4 space-y-3 border-t border-amber-200 pt-3"
          >
            <div className="text-xs text-slate-600">
              Owner mengupload dokumen atas nama penghuni. Pastikan Anda sudah
              mendapat izin dari penghuni & memegang copy KTP fisik.
            </div>
            <input type="hidden" name="userId" value={tenant.id} />
            {!hasKtp && (
              <CameraInput
                name="ktp"
                label="Foto / scan KTP"
                capture="environment"
                helper="Pastikan teks pada KTP jelas terbaca. Format: JPG/PNG/PDF, maks 8 MB."
              />
            )}
            {!hasSelfie && (
              <CameraInput
                name="selfie"
                label="Foto diri penghuni"
                capture="environment"
                helper="Boleh foto langsung di tempat, atau kirim ulang dari HP penghuni."
              />
            )}
            {uploadState?.error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadState.error}
              </div>
            )}
            {uploadState?.success && (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {uploadState.success}
              </div>
            )}
            <UploadDocsButton />
          </form>
        )}
      </div>

      {/* Form: setujui & assign — cascade kos -> kamar */}
      <form
        action={assignAction}
        className="mt-4 grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-2"
      >
        <input type="hidden" name="userId" value={tenant.id} />
        <div>
          <label className="label">1. Lokasi kos</label>
          <select
            value={selectedKosId}
            onChange={(e) => setSelectedKosId(e.target.value)}
            className="input"
            required
          >
            <option value="" disabled>
              Pilih kos…
            </option>
            {kosOptions.map((k) => (
              <option key={k.id} value={k.id} disabled={k.rooms.length === 0}>
                {k.name}{" "}
                {k.rooms.length === 0
                  ? "(tidak ada kamar kosong)"
                  : `(${k.rooms.length} kamar kosong)`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">2. Kamar</label>
          <select name="roomId" className="input" required defaultValue="">
            <option value="" disabled>
              {selectedKosId ? "Pilih kamar…" : "Pilih kos dulu"}
            </option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Kamar {r.name} — {rupiah(r.monthlyPrice)}/bulan
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">3. Tanggal mulai masuk</label>
            <input
              type="date"
              name="startDate"
              className="input"
              required
              defaultValue={today()}
            />
            <p className="mt-1 text-xs text-slate-500">
              Jatuh tempo bulanan otomatis = tanggal yang sama tiap bulan.
            </p>
          </div>
          <div className="flex items-end justify-end">
            <ApproveButton
              label="Setujui & assign ke kamar"
              disabled={!docsComplete}
            />
          </div>
        </div>
        {!docsComplete && (
          <div className="sm:col-span-2 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900">
            Tombol setuju terkunci sampai KTP & foto diri lengkap. Minta
            penghuni melengkapi onboarding, atau upload dari panel di atas.
          </div>
        )}
        {!hasAnyAvailable && (
          <div className="sm:col-span-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Anda belum punya kamar kosong di kos manapun. Tambah kamar lewat
            menu <span className="font-medium">Kos & Kamar</span> dulu sebelum
            menyetujui penghuni baru.
          </div>
        )}
        {assignState?.error && (
          <div className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {assignState?.error}
          </div>
        )}
        {assignState?.success && (
          <div className="sm:col-span-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {assignState?.success}
          </div>
        )}
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Atau:</span>
        <form action={rejectActionForm}>
          <input type="hidden" name="userId" value={tenant.id} />
          <RejectButton />
        </form>
      </div>
      {rejectState?.error && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {rejectState.error}
        </div>
      )}
      {rejectState?.success && (
        <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {rejectState.success}
        </div>
      )}
    </div>
  );
}

function DocStatus({
  label,
  url,
  viewerLabel,
}: {
  label: string;
  url: string | null;
  viewerLabel: string;
}) {
  if (url) {
    return (
      <a
        href={viewerUrl(url, viewerLabel)}
        className="block rounded border border-slate-200 bg-white p-2 transition hover:border-brand-400"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="mb-1 h-20 w-full rounded object-cover"
        />
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-700">{label}</span>
          <span className="text-emerald-700">✓</span>
        </div>
      </a>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-amber-400 bg-white/60 p-2 text-center">
      <div className="grid h-20 w-full place-items-center rounded bg-amber-100/50 text-2xl text-amber-500">
        📄
      </div>
      <div className="mt-1 text-[11px] font-medium text-slate-700">{label}</div>
      <div className="text-[10px] font-semibold text-amber-800">
        Belum diupload
      </div>
    </div>
  );
}
