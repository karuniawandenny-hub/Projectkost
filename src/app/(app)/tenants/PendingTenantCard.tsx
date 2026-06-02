"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState } from "react";
import {
  approveAndAssignTenant,
  rejectTenant,
  type ApproveTenantState,
} from "./actions";

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

  // Cascade: pilih kos -> kamar yang ditampilkan terfilter berdasarkan kos itu.
  const [selectedKosId, setSelectedKosId] = useState<string>("");
  const rooms = useMemo(() => {
    const k = kosOptions.find((x) => x.id === selectedKosId);
    return k?.rooms ?? [];
  }, [selectedKosId, kosOptions]);

  const onboarded = !!tenant.onboardedAt;
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
            <ApproveButton label="Setujui & assign ke kamar" />
          </div>
        </div>
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
