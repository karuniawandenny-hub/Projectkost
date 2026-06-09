"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createAnnouncement, type AnnouncementState } from "./actions";

const initial: AnnouncementState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Mengirim…" : "Kirim pengumuman"}
    </button>
  );
}

export function AnnouncementForm({
  kosList,
}: {
  kosList: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createAnnouncement, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset field setelah sukses kirim.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label className="text-sm font-medium text-slate-700">
          Tujuan
        </label>
        <select name="kosId" defaultValue="__all__" className="input mt-1">
          <option value="__all__">Semua penghuni (semua kos saya)</option>
          {kosList.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">Judul</label>
        <input
          name="title"
          required
          minLength={3}
          placeholder="Mis. Pemberitahuan mati air"
          className="input mt-1"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">Isi</label>
        <textarea
          name="body"
          required
          minLength={5}
          rows={4}
          placeholder="Tulis isi pengumuman untuk penghuni…"
          className="input mt-1"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="alsoEmail"
          defaultChecked
          className="h-4 w-4 rounded border-slate-300"
        />
        Kirim juga lewat email
      </label>

      {state.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </div>
      )}

      <SubmitButton />
      <p className="text-xs text-slate-500">
        Penghuni menerima notifikasi di aplikasi + push HP (jika diaktifkan)
        {""}, dan email bila dicentang.
      </p>
    </form>
  );
}
