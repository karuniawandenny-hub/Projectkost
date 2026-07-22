"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  CATEGORIES_BY_ROLE,
  NOTIF_CATEGORY_LABEL,
  NOTIF_CATEGORY_HINT,
  type NotifRole,
  type NotifPrefs,
} from "@/lib/notif-prefs";
import {
  updateNotifPrefs,
  type UpdatePrefsState,
} from "./actions";

const initial: UpdatePrefsState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Menyimpan…" : "Simpan preferensi"}
    </button>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export function NotifPrefsForm({
  initialPrefs,
  role,
}: {
  initialPrefs: NotifPrefs;
  role: NotifRole;
}) {
  const [state, formAction] = useFormState(updateNotifPrefs, initial);

  // Kategori yang di-render — HANYA yang relevan untuk role user.
  // Tenant tidak lihat toggle "Komplain baru dari penghuni", dan
  // sebaliknya.
  const categories = CATEGORIES_BY_ROLE[role];

  return (
    <form action={formAction} className="space-y-5">
      {/* Matriks kategori × channel */}
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2">Kategori</th>
              <th className="px-3 py-2 text-center">Push (HP)</th>
              <th className="px-3 py-2 text-center">Email</th>
              <th className="px-3 py-2 text-center">WhatsApp</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((cat) => {
              const label = NOTIF_CATEGORY_LABEL[cat];
              const hint = NOTIF_CATEGORY_HINT[cat];
              return (
                <tr key={cat}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-slate-500">{hint}</div>
                  </td>
                  {(["push", "email", "wa"] as const).map((ch) => (
                    <td key={ch} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        name={`${ch}.${cat}`}
                        defaultChecked={initialPrefs[ch][cat]}
                        className="h-5 w-5 rounded border-slate-300"
                        aria-label={`${label} - ${ch}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Notifikasi di dalam aplikasi (lonceng) <strong>selalu aktif</strong> sebagai
        catatan. Yang di atas mengatur apakah perlu dikirim ke HP/email/WA.
      </p>

      {/* Jam tenang */}
      <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="quietHours.enabled"
            defaultChecked={initialPrefs.quietHours.enabled}
            className="h-4 w-4 rounded border-slate-300"
          />
          Jam tenang — tahan push/email/WA pada jam tertentu
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>Dari pukul</span>
          <select
            name="quietHours.startHour"
            defaultValue={initialPrefs.quietHours.startHour}
            className="input w-24"
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <span>sampai</span>
          <select
            name="quietHours.endHour"
            defaultValue={initialPrefs.quietHours.endHour}
            className="input w-24"
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Selama jam tenang, semua channel ke luar (push/email/WA) ditahan.
          Notifikasi tetap dicatat di lonceng — bisa dibaca saat Anda buka app
          lagi.
        </p>
      </div>

      {state.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Preferensi disimpan.
        </div>
      )}
      {state.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
