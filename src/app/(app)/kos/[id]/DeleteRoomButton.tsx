"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import { deleteRoom, type DeleteRoomState } from "../actions";

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-danger disabled:opacity-50"
      disabled={pending || !enabled}
    >
      {pending ? "Menghapus…" : "Ya, hapus kamar ini"}
    </button>
  );
}

/**
 * Tombol hapus kamar — destruktif, jadi pakai flow konfirmasi ketik
 * ulang nama kamar untuk cegah accidental click. Sebelum submit,
 * user diberi tahu dampak cascade (riwayat sewa, pembayaran, komplain
 * yang ikut terhapus).
 */
export function DeleteRoomButton({
  roomId,
  roomName,
  historicalTenancies,
}: {
  roomId: string;
  roomName: string;
  /** Total tenancy (aktif + historis). Kalau > 0, warning cascade
   *  lebih tegas karena bakal juga hapus payment & complaint terkait. */
  historicalTenancies: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [state, formAction] = useFormState<DeleteRoomState, FormData>(
    deleteRoom,
    {}
  );

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      setConfirmText("");
    }
  }, [state]);

  const hasHistory = historicalTenancies > 0;
  const matches = confirmText.trim() === roomName.trim();

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-red-600 hover:underline"
        >
          Hapus kamar
        </button>
        {state.error && (
          <div className="text-xs text-red-600">{state.error}</div>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-lg border-2 border-red-300 bg-red-50 p-3 space-y-3"
    >
      <input type="hidden" name="id" value={roomId} />

      <div className="text-sm font-semibold text-red-800">
        Hapus kamar {roomName}?
      </div>

      {hasHistory ? (
        <div className="rounded-md bg-white/70 p-2.5 text-xs text-slate-700 leading-relaxed">
          ⚠️ Kamar ini pernah dihuni{" "}
          <strong>{historicalTenancies} kali</strong>. Menghapusnya akan{" "}
          <strong>menghilangkan permanen</strong> seluruh riwayat sewa, catatan
          pembayaran + kuitansi, komplain, dan permintaan pindah yang terkait
          kamar ini.
          <div className="mt-2 text-slate-600">
            Data tidak bisa dikembalikan. Aksi ini tercatat di audit log.
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-600">
          Kamar ini belum pernah dihuni — aman dihapus.
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-700 block mb-1">
          Ketik nama kamar <strong>{roomName}</strong> untuk konfirmasi:
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={roomName}
          className="input text-sm"
          autoComplete="off"
          autoFocus
        />
      </div>

      {state.error && (
        <div className="rounded-md bg-red-100 px-2 py-1.5 text-xs text-red-800">
          {state.error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
          }}
          className="btn-secondary text-sm"
        >
          Batal
        </button>
        <SubmitButton enabled={matches} />
      </div>
    </form>
  );
}
