"use client";

import { useState, useTransition } from "react";
import {
  setMaintenanceWaEnabledAction,
  type TestActionState,
} from "./actions";

export function MaintenanceWaToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestActionState | null>(null);

  function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const r = await setMaintenanceWaEnabledAction(next);
      setResult(r);
      if (!r.ok) setEnabled(!next); // revert kalau gagal
    });
  }

  return (
    <div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggle}
          disabled={pending}
          className="mt-1 h-4 w-4 rounded border-slate-300"
        />
        <span className="flex-1 text-sm">
          <span className="font-medium text-slate-800">
            Kirim WhatsApp saat pemilik melakukan perawatan kos
          </span>
          <span className="block text-xs text-slate-500 mt-0.5">
            Off (default): penghuni hanya terima in-app + email untuk
            event SCHEDULED / IN_PROGRESS / COMPLETED. Hemat kuota WA &
            tidak mengganggu penghuni dengan terlalu banyak pesan.
            Aktifkan kalau ingin penghuni dapat 3 channel sekaligus.
          </span>
        </span>
      </label>
      {result && (
        <div
          className={
            result.ok
              ? "mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
              : "mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
          }
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
