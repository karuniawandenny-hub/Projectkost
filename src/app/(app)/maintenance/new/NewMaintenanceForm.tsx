"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState } from "react";
import { createPreventive, type MaintActionState } from "../actions";
import { RECURRENCE_OPTIONS } from "@/lib/maintenance";

const initial: MaintActionState = {};

export type KosOpt = {
  id: string;
  name: string;
  rooms: { id: string; name: string }[];
};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Menyimpan…" : "Simpan jadwal"}
    </button>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewMaintenanceForm({ kosOptions }: { kosOptions: KosOpt[] }) {
  const [state, formAction] = useFormState(createPreventive, initial);
  const [selectedKosId, setSelectedKosId] = useState(kosOptions[0]?.id ?? "");
  const rooms = useMemo(
    () => kosOptions.find((k) => k.id === selectedKosId)?.rooms ?? [],
    [selectedKosId, kosOptions]
  );

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <label className="label">1. Kos</label>
        <select
          name="kosId"
          value={selectedKosId}
          onChange={(e) => setSelectedKosId(e.target.value)}
          className="input"
          required
        >
          <option value="" disabled>
            Pilih kos…
          </option>
          {kosOptions.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">2. Cakupan</label>
        <select name="roomId" className="input" defaultValue="__none__">
          <option value="__none__">
            Fasilitas kos (tidak terikat ke kamar tertentu)
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              Kamar {r.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Pilih kamar spesifik (mis. AC kamar A1) atau biarkan fasilitas kos
          untuk barang bersama (pompa air, taman, dll).
        </p>
      </div>

      <div>
        <label className="label">3. Judul perawatan</label>
        <input
          name="title"
          className="input"
          required
          minLength={3}
          placeholder="Mis. Service AC, Cek pompa air, Bersih saluran"
        />
      </div>

      <div>
        <label className="label">4. Deskripsi (opsional)</label>
        <textarea
          name="description"
          className="input"
          rows={3}
          placeholder="Detail apa yang perlu dicek/dikerjakan"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">5. Tanggal jadwal</label>
          <input
            type="date"
            name="scheduledDate"
            className="input"
            required
            defaultValue={todayISO()}
          />
        </div>
        <div>
          <label className="label">6. Ulang otomatis</label>
          <select name="recurrenceMonths" className="input" defaultValue="0">
            <option value="0">Tidak (sekali jalan)</option>
            {RECURRENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Saat ditandai selesai, sistem auto-bikin jadwal berikutnya.
          </p>
        </div>
      </div>

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <SubmitBtn />
      </div>
    </form>
  );
}
