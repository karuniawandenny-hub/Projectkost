"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  required?: boolean;
  accept?: string;
  /** Hint kamera. "environment" = kamera belakang (KTP, kerusakan, bukti
   *  transfer). "user" = kamera depan untuk selfie. */
  capture?: "environment" | "user";
  label?: string;
  helper?: string;
};

/**
 * Input file dengan dua opsi:
 *  - "Ambil foto"  -> membuka modal kamera live via getUserMedia()
 *                     (kamera benar-benar aktif di desktop & HP), atau
 *                     fallback ke native HTML capture jika getUserMedia
 *                     tidak tersedia / izin ditolak.
 *  - "Pilih file"  -> dialog file picker biasa.
 *
 * File hasil di-set ke <input type="file" name={name}> tersembunyi
 * via DataTransfer, sehingga submit form FormData tetap bekerja.
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
  const [showCamera, setShowCamera] = useState(false);

  function openFilePicker() {
    const el = fileRef.current;
    if (!el) return;
    el.removeAttribute("capture");
    el.click();
  }

  function openCamera() {
    // Cek dukungan getUserMedia. Jika tidak ada -> fallback ke native capture.
    const hasMediaDevices =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    if (!hasMediaDevices) {
      const el = fileRef.current;
      if (!el) return;
      el.setAttribute("capture", capture ?? "environment");
      el.click();
      return;
    }
    setShowCamera(true);
  }

  function applyFile(file: File) {
    setFilename(file.name);
    if (file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
    // Pasang File ke hidden input via DataTransfer agar ikut terkirim
    // saat form di-submit sebagai FormData.
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setPreview(null);
      setFilename(null);
      return;
    }
    setFilename(f.name);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openCamera} className="btn-primary">
          Ambil foto
        </button>
        <button type="button" onClick={openFilePicker} className="btn-secondary">
          Pilih dari file
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        name={name}
        accept={accept}
        required={required}
        onChange={onFileChange}
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

      {showCamera && (
        <CameraModal
          facingMode={capture ?? "environment"}
          onCancel={() => setShowCamera(false)}
          onCapture={(file) => {
            applyFile(file);
            setShowCamera(false);
          }}
        />
      )}
    </div>
  );
}

type ModalProps = {
  facingMode: "user" | "environment";
  onCancel: () => void;
  onCapture: (file: File) => void;
};

function CameraModal({ facingMode, onCancel, onCapture }: ModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<"user" | "environment">(facingMode);
  const [busy, setBusy] = useState(false);

  // Buka stream saat modal mount / saat user ganti kamera.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      setError(null);
      setReady(false);
      // Hentikan stream sebelumnya jika ada.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: current },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.name === "NotAllowedError"
              ? "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser."
              : e.name === "NotFoundError"
                ? "Tidak ada kamera yang terdeteksi pada perangkat ini."
                : e.name === "NotReadableError"
                  ? "Kamera sedang dipakai aplikasi lain."
                  : e.message
            : "Tidak bisa mengakses kamera.";
        setError(msg);
      }
    }
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  async function snap() {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    setBusy(true);
    try {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas tidak didukung.");
      ctx.drawImage(video, 0, 0, w, h);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("Gagal membuat gambar.");
      const file = new File([blob], `capture-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      onCapture(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">Ambil foto</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="bg-slate-900">
          {/* Video preview */}
          <div className="relative aspect-video w-full">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`h-full w-full object-cover ${current === "user" ? "scale-x-[-1]" : ""}`}
            />
            {!ready && !error && (
              <div className="absolute inset-0 grid place-items-center text-sm text-slate-200">
                Mengaktifkan kamera…
              </div>
            )}
            {error && (
              <div className="absolute inset-0 grid place-items-center p-4 text-center">
                <div>
                  <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    Anda tetap bisa pakai &quot;Pilih dari file&quot; untuk
                    mengunggah foto.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={() =>
              setCurrent((c) => (c === "user" ? "environment" : "user"))
            }
            className="btn-secondary"
            disabled={busy}
          >
            Balik kamera
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary"
              disabled={busy}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={snap}
              className="btn-primary"
              disabled={!ready || busy || !!error}
            >
              {busy ? "Memproses…" : "Ambil"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
