"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitComplaint, type ComplaintSubmitState } from "../actions";
import { CameraModal } from "@/components/CameraInput";

const initial: ComplaintSubmitState = {};
const MAX_PHOTOS = 4;

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
  const filesInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);

  useEffect(() => {
    // Cek dukungan kamera (akan false di context non-secure / tidak ada kamera).
    const has =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    setCameraSupported(has);
  }, []);

  // Sinkronisasi state -> object URLs untuk preview + hidden input (FormData submit).
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    if (filesInputRef.current) {
      const dt = new DataTransfer();
      photos.forEach((f) => dt.items.add(f));
      filesInputRef.current.files = dt.files;
    }
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photos]);

  function addFiles(newFiles: File[]) {
    setPhotos((prev) => {
      const merged = [...prev, ...newFiles].slice(0, MAX_PHOTOS);
      return merged;
    });
  }

  function removeAt(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function openCamera() {
    if (photos.length >= MAX_PHOTOS) return;
    if (!cameraSupported) {
      // Fallback: trigger native picker dengan capture attr untuk HP.
      const el = pickerRef.current;
      if (el) {
        el.setAttribute("capture", "environment");
        el.click();
      }
      return;
    }
    setShowCamera(true);
  }

  function openFilePicker() {
    if (photos.length >= MAX_PHOTOS) return;
    const el = pickerRef.current;
    if (!el) return;
    el.removeAttribute("capture");
    el.click();
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const arr = Array.from(list).slice(0, MAX_PHOTOS - photos.length);
    addFiles(arr);
    // Reset picker agar bisa pilih file sama berkali-kali.
    e.target.value = "";
  }

  const slotsLeft = MAX_PHOTOS - photos.length;

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
        <span className="label">
          Foto (opsional, maks {MAX_PHOTOS}) — {photos.length}/{MAX_PHOTOS}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={openCamera}
            disabled={slotsLeft === 0}
          >
            Ambil foto
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={openFilePicker}
            disabled={slotsLeft === 0}
          >
            Pilih dari file
          </button>
        </div>

        {/* Hidden input yang mengirim semua foto saat submit form */}
        <input
          ref={filesInputRef}
          type="file"
          name="photos"
          accept="image/*"
          multiple
          className="hidden"
          tabIndex={-1}
        />
        {/* Hidden picker untuk dialog pilih file / kamera native (fallback) */}
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPicked}
          className="hidden"
          tabIndex={-1}
        />

        {previews.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`foto ${i + 1}`}
                  className="h-24 w-24 rounded-md object-cover border"
                />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md hover:bg-red-700"
                  aria-label={`Hapus foto ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {slotsLeft === 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Maksimal {MAX_PHOTOS} foto. Hapus salah satu untuk menambah yang lain.
          </p>
        )}
      </div>

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      <SubmitButton />

      {showCamera && (
        <CameraModal
          facingMode="environment"
          onCancel={() => setShowCamera(false)}
          onCapture={(file) => {
            addFiles([file]);
            setShowCamera(false);
          }}
        />
      )}
    </form>
  );
}
