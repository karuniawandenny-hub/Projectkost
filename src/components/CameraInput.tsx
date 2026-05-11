"use client";

import { useRef, useState } from "react";

type Props = {
  name: string;
  required?: boolean;
  accept?: string;
  /** Hint kamera. "environment" untuk kamera belakang (KTP, kerusakan, bukti transfer), "user" untuk selfie. */
  capture?: "environment" | "user";
  label?: string;
  helper?: string;
};

/**
 * Input file dengan preview, tombol "Ambil foto" (kamera) dan "Pilih file".
 */
export function CameraInput({
  name,
  required,
  accept = "image/*",
  capture,
  label,
  helper,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  function pick(mode: "file" | "camera") {
    const el = fileRef.current;
    if (!el) return;
    if (mode === "camera") el.setAttribute("capture", capture ?? "environment");
    else el.removeAttribute("capture");
    el.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setPreview(null);
      setFilename(null);
      return;
    }
    setFilename(f.name);
    if (f.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  }

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => pick("camera")} className="btn-primary">
          Ambil foto
        </button>
        <button type="button" onClick={() => pick("file")} className="btn-secondary">
          Pilih dari file
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        name={name}
        accept={accept}
        required={required}
        onChange={onChange}
        className="hidden"
      />
      {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
      {filename && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-600 mb-2 truncate">{filename}</div>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="preview"
              className="max-h-64 w-auto rounded-md border"
            />
          )}
        </div>
      )}
    </div>
  );
}
