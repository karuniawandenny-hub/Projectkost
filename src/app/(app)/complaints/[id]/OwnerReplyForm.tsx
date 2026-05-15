"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { replyComplaint, type ReplyComplaintState } from "../actions";
import { CameraModal } from "@/components/CameraInput";

const initial: ReplyComplaintState = {};
const MAX_NEW_PHOTOS = 6;

type Props = {
  complaintId: string;
  currentReply: string | null;
  currentStatus: string;
  existingResolutionPhotos: number;
};

function ActionButton({
  name,
  value,
  className,
  children,
}: {
  name: string;
  value: string;
  className: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
    >
      {children}
    </button>
  );
}

export function OwnerReplyForm({
  complaintId,
  currentReply,
  currentStatus,
  existingResolutionPhotos,
}: Props) {
  const [state, formAction] = useFormState(replyComplaint, initial);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);

  useEffect(() => {
    const has =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    setCameraSupported(has);
  }, []);

  // Sinkronisasi state -> previews + hidden input.
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    if (filesInputRef.current) {
      const dt = new DataTransfer();
      photos.forEach((f) => dt.items.add(f));
      filesInputRef.current.files = dt.files;
    }
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  // Setelah submit sukses, kosongkan state photos agar tidak terkirim ulang.
  useEffect(() => {
    if (state?.success) setPhotos([]);
  }, [state]);

  const slotsLeft = Math.max(
    0,
    MAX_NEW_PHOTOS - existingResolutionPhotos - photos.length
  );

  function addFiles(arr: File[]) {
    setPhotos((prev) => {
      const merged = [...prev, ...arr].slice(
        0,
        MAX_NEW_PHOTOS - existingResolutionPhotos
      );
      return merged;
    });
  }

  function removeAt(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  function openCamera() {
    if (slotsLeft === 0) return;
    if (!cameraSupported) {
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
    if (slotsLeft === 0) return;
    const el = pickerRef.current;
    if (!el) return;
    el.removeAttribute("capture");
    el.click();
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const arr = Array.from(list).slice(0, slotsLeft);
    addFiles(arr);
    e.target.value = "";
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="complaintId" value={complaintId} />
      <div>
        <label className="label">Balasan untuk penghuni</label>
        <textarea
          name="ownerReply"
          rows={3}
          className="input"
          defaultValue={currentReply ?? ""}
          placeholder="Mis. baik, tukang akan datang besok pagi. Foto bukti perbaikan terlampir."
        />
      </div>

      <div>
        <span className="label">
          Foto bukti dukung (opsional, total maks {MAX_NEW_PHOTOS}) —{" "}
          {existingResolutionPhotos + photos.length}/{MAX_NEW_PHOTOS}
        </span>
        <p className="text-xs text-slate-500 -mt-1 mb-2">
          Lampirkan foto perbaikan / kondisi setelah komplain ditangani.
          Foto akan terlihat juga oleh penghuni.
        </p>
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

        <input
          ref={filesInputRef}
          type="file"
          name="resolutionPhotos"
          accept="image/*"
          multiple
          className="hidden"
          tabIndex={-1}
        />
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
                  alt={`bukti ${i + 1}`}
                  className="h-24 w-24 rounded-md object-cover border"
                />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md hover:bg-red-700"
                  aria-label={`Hapus bukti ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {slotsLeft === 0 && existingResolutionPhotos + photos.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Sudah mencapai batas maksimal foto bukti.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton name="action" value="IN_PROGRESS" className="btn-secondary">
          Tandai diproses
        </ActionButton>
        <ActionButton name="action" value="RESOLVED" className="btn-success">
          Tandai selesai
        </ActionButton>
        {currentStatus !== "OPEN" && (
          <ActionButton name="action" value="REOPEN" className="btn-secondary">
            Buka ulang
          </ActionButton>
        )}
        <ActionButton name="action" value="" className="btn-secondary">
          Simpan tanpa ubah status
        </ActionButton>
      </div>

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state?.success}
        </div>
      )}

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
