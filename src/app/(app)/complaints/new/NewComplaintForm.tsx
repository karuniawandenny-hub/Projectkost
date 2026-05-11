"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitComplaint, type ComplaintSubmitState } from "../actions";

const initial: ComplaintSubmitState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Mengirim…" : "Kirim komplain"}
    </button>
  );
}

export function NewComplaintForm() {
  const [state, formAction] = useFormState(submitComplaint, initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const urls = files
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => URL.createObjectURL(f));
    setPreviews(urls);
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label">Judul</label>
        <input
          name="title"
          className="input"
          placeholder="Mis. Keran kamar mandi bocor"
          required
          minLength={3}
        />
      </div>
      <div>
        <label className="label">Deskripsi</label>
        <textarea
          name="description"
          rows={4}
          className="input"
          placeholder="Jelaskan masalah Anda…"
          required
          minLength={5}
        />
      </div>

      <div>
        <span className="label">Foto (opsional, maks 4)</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => camRef.current?.click()}
          >
            Ambil foto
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            Pilih dari file
          </button>
        </div>
        {/*
          Dua input file tetap mengirim semua file ke FormData (`photos`),
          kita merge keduanya di server action.
        */}
        <input
          ref={camRef}
          type="file"
          name="photos"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onFilesChange}
          className="hidden"
        />
        <input
          ref={fileRef}
          type="file"
          name="photos"
          accept="image/*"
          multiple
          onChange={onFilesChange}
          className="hidden"
        />
        {previews.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`foto ${i + 1}`}
                className="h-24 w-24 rounded-md object-cover border"
              />
            ))}
          </div>
        )}
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
