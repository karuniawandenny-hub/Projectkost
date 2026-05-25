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

export function CameraModal({ facingMode, onCancel, onCapture }: ModalProps) {
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
            // Minta resolusi tinggi tanpa lock orientation - device pilih
            // landscape/portrait sesuai cara user pegang HP.
            width: { ideal: 2560, min: 1280 },
            height: { ideal: 1440, min: 720 },
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
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between bg-black/80 px-4 py-3 text-white backdrop-blur-sm"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <h3 className="text-sm font-semibold sm:text-base">Ambil foto</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Tutup"
          className="rounded-full p-2 text-white hover:bg-white/10"
        >
          ✕
        </button>
      </div>

      {/* Camera preview - mengisi seluruh ruang vertikal yang tersisa */}
      <div className="relative flex-1 overflow-hidden bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 h-full w-full object-contain ${
            current === "user" ? "scale-x-[-1]" : ""
          }`}
        />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-slate-200">
            Mengaktifkan kamera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div className="max-w-sm">
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

      {/* Bottom controls */}
      <div
        className="flex items-center justify-between gap-3 bg-black/90 px-4 py-4 text-white backdrop-blur-sm"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() =>
            setCurrent((c) => (c === "user" ? "environment" : "user"))
          }
          disabled={busy}
          className="rounded-full border border-white/30 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50 sm:text-sm"
        >
          ↺ Balik
        </button>

        <button
          type="button"
          onClick={snap}
          disabled={!ready || busy || !!error}
          aria-label="Ambil foto"
          className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-white shadow-lg transition active:scale-95 disabled:opacity-40 sm:h-20 sm:w-20"
        >
          <span className="block h-12 w-12 rounded-full bg-white ring-2 ring-slate-900/20 sm:h-14 sm:w-14" />
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-white/30 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50 sm:text-sm"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
