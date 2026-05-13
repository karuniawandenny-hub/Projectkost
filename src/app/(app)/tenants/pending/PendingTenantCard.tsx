"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  approveAndAssignTenant,
  approveTenant,
  rejectTenant,
  type ApproveTenantState,
} from "../actions";

const initial: ApproveTenantState = {};

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

function ApproveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-success" disabled={pending}>
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

export function PendingTenantCard({
  tenant,
  rooms,
}: {
  tenant: Tenant;
  rooms: { id: string; label: string }[];
}) {
  const [assignState, assignAction] = useFormState(
    approveAndAssignTenant,
    initial
  );
  const [approveState, approveActionForm] = useFormState(approveTenant, initial);
  const [rejectState, rejectActionForm] = useFormState(rejectTenant, initial);

  const onboarded = !!tenant.onboardedAt;

  return (
    <div className="card">
      <div className="flex items-start gap-4 flex-wrap">
        {/* Foto selfie */}
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
            {tenant.ktpPhotoUrl ? (
              <a
                href={tenant.ktpPhotoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="badge-blue hover:underline"
              >
                Lihat KTP
              </a>
            ) : (
              <span className="badge-slate">KTP belum diunggah</span>
            )}
          </div>
        </div>
      </div>

      {/* Form: setujui & assign */}
      <form action={assignAction} className="mt-4 grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="userId" value={tenant.id} />
        <div>
          <label className="label">Setujui & assign langsung ke kamar</label>
          <select name="roomId" className="input" required defaultValue="">
            <option value="" disabled>
              Pilih kamar kosong…
            </option>
            {rooms.length === 0 ? (
              <option value="" disabled>
                Belum ada kamar kosong di kos Anda
              </option>
            ) : (
              rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))
            )}
          </select>
        </div>
        <ApproveButton label="Setujui & assign" />
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

      {/* Form: setujui saja / tolak */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Tindakan lain:</span>
        <form action={approveActionForm}>
          <input type="hidden" name="userId" value={tenant.id} />
          <ApproveButton label="Setujui saja (assign nanti)" />
        </form>
        <form action={rejectActionForm}>
          <input type="hidden" name="userId" value={tenant.id} />
          <RejectButton />
        </form>
      </div>
      {(approveState?.error || rejectState?.error) && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {approveState?.error ?? rejectState?.error}
        </div>
      )}
      {(approveState?.success || rejectState?.success) && (
        <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {approveState?.success ?? rejectState?.success}
        </div>
      )}
    </div>
  );
}
