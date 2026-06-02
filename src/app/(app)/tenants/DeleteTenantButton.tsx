"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { deleteTenant, type DeleteTenantState } from "./actions";

function SubmitButton({ tenantName }: { tenantName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-danger disabled:opacity-60"
      disabled={pending}
    >
      {pending ? "Menghapus…" : `Ya, hapus ${tenantName}`}
    </button>
  );
}

/**
 * Tombol hapus penghuni — buka dialog konfirmasi dengan input ketik
 * nama tenant untuk mencegah accidental click. Hanya muncul untuk
 * ADMIN atau OWNER (parent halaman yang sudah filter ini).
 */
export function DeleteTenantButton({
  userId,
  tenantName,
  buttonLabel = "Hapus permanen",
  buttonClassName = "btn-danger",
}: {
  userId: string;
  tenantName: string;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [state, formAction] = useFormState<DeleteTenantState, FormData>(
    deleteTenant,
    {}
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
      setConfirmText("");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const matches = confirmText.trim() === tenantName.trim();

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-rose-700">
              Hapus permanen penghuni?
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              Aksi ini akan menghapus akun{" "}
              <strong>{tenantName}</strong> beserta{" "}
              <strong>semua data terkait</strong>: riwayat sewa, pembayaran,
              komplain, foto KTP/selfie, bukti transfer, dan foto komplain.
            </p>
            <p className="mt-2 text-sm font-semibold text-rose-600">
              Aksi ini TIDAK BISA di-undo.
            </p>

            <label className="label mt-4 block">
              Ketik nama penghuni{" "}
              <span className="font-mono text-rose-700">{tenantName}</span>{" "}
              untuk konfirmasi:
            </label>
            <input
              className="input mt-1"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={tenantName}
              autoFocus
            />

            <form action={formAction} className="mt-4 flex justify-end gap-2">
              <input type="hidden" name="userId" value={userId} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setOpen(false);
                  setConfirmText("");
                }}
              >
                Batal
              </button>
              {matches ? (
                <SubmitButton tenantName={tenantName} />
              ) : (
                <button
                  type="button"
                  className="btn-danger opacity-50 cursor-not-allowed"
                  disabled
                >
                  Ketik nama dulu
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
