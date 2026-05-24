"use client";

import { useState, useTransition } from "react";
import {
  setDueDateOffsetAction,
  resetRemindersAction,
} from "./actions";

type Props = {
  paymentId: string;
  reminderCount: number;
};

/**
 * Kontrol testing per-payment di /admin/payments:
 *  - 4 shortcut button geser dueDate ke H+7/H+3/H+1/H-1
 *  - 1 tombol reset ReminderLog tagihan tsb
 *
 * Hanya muncul untuk admin (sudah di-guard oleh layout).
 */
export function TestControls({ paymentId, reminderCount }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function setOffset(days: number, label: string) {
    if (
      !confirm(
        `Geser jatuh tempo ke ${label} (today ${days >= 0 ? "+" : ""}${days} hari)? Tagihan ini akan ter-update di DB.`
      )
    )
      return;
    startTransition(async () => {
      const r = await setDueDateOffsetAction(paymentId, days);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  function resetLog() {
    if (
      !confirm(
        `Hapus ${reminderCount} entri ReminderLog tagihan ini? Reminder yang sama bisa dipicu ulang setelah ini.`
      )
    )
      return;
    startTransition(async () => {
      const r = await resetRemindersAction(paymentId);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-amber-300 bg-amber-50/50 p-2">
      <div className="text-xs font-medium text-amber-900 mb-1.5">
        🧪 Testing reminder ({reminderCount} log)
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setOffset(7, "H+7")}
          disabled={pending}
          className="rounded border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
        >
          H+7
        </button>
        <button
          onClick={() => setOffset(3, "H+3")}
          disabled={pending}
          className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          H+3
        </button>
        <button
          onClick={() => setOffset(1, "H+1")}
          disabled={pending}
          className="rounded border border-orange-300 bg-white px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
        >
          H+1
        </button>
        <button
          onClick={() => setOffset(-1, "OVERDUE")}
          disabled={pending}
          className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          OVERDUE (H-1)
        </button>
        <button
          onClick={resetLog}
          disabled={pending || reminderCount === 0}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          title={
            reminderCount === 0
              ? "Tidak ada log untuk dihapus"
              : "Hapus semua ReminderLog tagihan ini"
          }
        >
          Reset log
        </button>
      </div>
      {msg && (
        <div
          className={`mt-2 rounded px-2 py-1 text-xs ${
            msg.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
