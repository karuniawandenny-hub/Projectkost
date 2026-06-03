"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState } from "react";
import { createMaintenance, type MaintActionState } from "../actions";
import { RECURRENCE_OPTIONS } from "@/lib/maintenance";

const initial: MaintActionState = {};

export type KosOpt = {
  id: string;
  name: string;
  rooms: { id: string; name: string }[];
};

function SubmitBtn({ type }: { type: "PREVENTIVE" | "CORRECTIVE" }) {
  const { pending } = useFormStatus();
  const label =
    type === "CORRECTIVE" ? "Catat perbaikan" : "Simpan jadwal";
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Menyimpan…" : label}
    </button>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewMaintenanceForm({ kosOptions }: { kosOptions: KosOpt[] }) {
  const [state, formAction] = useFormState(createMaintenance, initial);
  const [selectedKosId, setSelectedKosId] = useState(kosOptions[0]?.id ?? "");
  const [type, setType] = useState<"PREVENTIVE" | "CORRECTIVE">("PREVENTIVE");
  const rooms = useMemo(
    () => kosOptions.find((k) => k.id === selectedKosId)?.rooms ?? [],
    [selectedKosId, kosOptions]
  );

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <label className="label">1. Jenis perawatan</label>
        <div className="grid grid-cols-2 gap-2">
          <label
            className={`cursor-pointer rounded-lg border-2 p-3 text-sm transition ${
              type === "PREVENTIVE"
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="type"
              value="PREVENTIVE"
              checked={type === "PREVENTIVE"}
              onChange={() => setType("PREVENTIVE")}
              className="sr-only"
            />
            <div className="font-semibold">Preventif</div>
            <div className="mt-0.5 text-xs text-slate-600">
              Perawatan rutin / pencegahan. Bisa berulang otomatis (mis.
              service AC tiap 3 bulan).
            </div>
          </label>
          <label
            className={`cursor-pointer rounded-lg border-2 p-3 text-sm transition ${
              type === "CORRECTIVE"
                ? "border-violet-500 bg-violet-50"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="type"
              value="CORRECTIVE"
              checked={type === "CORRECTIVE"}
              onChange={() => setType("CORRECTIVE")}
              className="sr-only"
            />
            <div className="font-semibold">Korektif</div>
            <div className="mt-0.5 text-xs text-slate-600">
              Perbaikan kerusakan (one-shot). Catat masalah yang Anda
              temukan sendiri tanpa lewat komplain penghuni.
            </div>
          </label>
        </div>
      </div>

      <div>
        <label className="label">2. Kos</label>
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
        <label className="label">3. Cakupan</label>
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
        <label className="label">4. Judul perawatan</label>
        <input
          name="title"
          className="input"
          required
          minLength={3}
          placeholder={
            type === "PREVENTIVE"
              ? "Mis. Service AC, Cek pompa air, Bersih saluran"
              : "Mis. Ganti keran rusak, Tambal atap bocor, Cat ulang dinding"
          }
        />
      </div>

      <div>
        <label className="label">5. Deskripsi (opsional)</label>
        <textarea
          name="description"
          className="input"
          rows={3}
          placeholder={
            type === "PREVENTIVE"
              ? "Detail apa yang perlu dicek/dikerjakan"
              : "Detail kerusakan dan rencana perbaikan"
          }
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">
            6. {type === "CORRECTIVE" ? "Tanggal rencana perbaikan" : "Tanggal jadwal"}
          </label>
          <input
            type="date"
            name="scheduledDate"
            className="input"
            required
            defaultValue={todayISO()}
          />
          {type === "CORRECTIVE" && (
            <p className="mt-1 text-xs text-slate-500">
              Kalau sudah dikerjakan sekarang, isi tanggal hari ini lalu klik
              &quot;Tandai selesai&quot; di halaman detail setelah simpan.
            </p>
          )}
        </div>
        {type === "PREVENTIVE" && (
          <div>
            <label className="label">7. Ulang otomatis</label>
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
        )}
      </div>

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <SubmitBtn type={type} />
      </div>
    </form>
  );
}
