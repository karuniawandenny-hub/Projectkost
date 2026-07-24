"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import { deleteAnnouncement, type DeleteAnnouncementState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-danger text-xs disabled:opacity-60"
      disabled={pending}
    >
      {pending ? "Menghapus…" : "Ya, hapus"}
    </button>
  );
}

/**
 * Tombol hapus pengumuman untuk pemilik/admin.
 *
 * Interaksi 2-langkah (tanpa dialog modal):
 *   Klik "Hapus" → tombol berubah jadi inline confirm bar dengan
 *   [Batal] [Ya, hapus]. Cukup ringan untuk data yang tidak sensitif
 *   (announcement = broadcast biasa), tapi tetap ada friction supaya
 *   tidak accidental click.
 */
export function DeleteAnnouncementButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useFormState<DeleteAnnouncementState, FormData>(
    deleteAnnouncement,
    {}
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state.error) {
      setErrorMsg(state.error);
      setConfirming(false);
    } else if (state.success) {
      // Row akan hilang setelah revalidatePath — tidak perlu reset state.
      setErrorMsg(null);
    }
  }, [state]);

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-red-600 hover:underline"
        >
          Hapus
        </button>
        {errorMsg && (
          <div className="text-[10px] text-red-600">{errorMsg}</div>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5"
    >
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-red-800">Yakin hapus?</span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs font-medium text-slate-600 hover:underline"
      >
        Batal
      </button>
      <SubmitButton />
    </form>
  );
}
