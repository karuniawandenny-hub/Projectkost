"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkApproveUsers, bulkRejectUsers } from "../../actions";

type Props = {
  pendingUserIds: string[];
};

/**
 * Bulk action bar untuk halaman /admin/users.
 * Mendengar event 'kosbaiti:select' dari checkbox di setiap row.
 * Tampil sticky di bawah saat ada item terpilih.
 */
export function BulkActions({ pendingUserIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onSelect(e: Event) {
      const ev = e as CustomEvent<{ id: string; checked: boolean }>;
      setSelected((prev) => {
        const next = new Set(prev);
        if (ev.detail.checked) next.add(ev.detail.id);
        else next.delete(ev.detail.id);
        return next;
      });
    }
    function onReset() {
      setSelected(new Set());
    }
    window.addEventListener("kosbaiti:select", onSelect);
    window.addEventListener("kosbaiti:bulk-reset", onReset);
    return () => {
      window.removeEventListener("kosbaiti:select", onSelect);
      window.removeEventListener("kosbaiti:bulk-reset", onReset);
    };
  }, []);

  function runApprove() {
    if (selected.size === 0) return;
    if (
      !confirm(`Setujui ${selected.size} pengajuan akun terpilih sekaligus?`)
    )
      return;
    const fd = new FormData();
    fd.set("userIds", [...selected].join(","));
    startTransition(async () => {
      try {
        await bulkApproveUsers(fd);
        toast.success(`${selected.size} pengguna disetujui.`);
        setSelected(new Set());
        window.dispatchEvent(new CustomEvent("kosbaiti:bulk-reset"));
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Gagal menyetujui pengguna."
        );
      }
    });
  }

  function runReject() {
    if (selected.size === 0) return;
    if (!confirm(`Tolak ${selected.size} pengajuan akun terpilih sekaligus?`))
      return;
    const fd = new FormData();
    fd.set("userIds", [...selected].join(","));
    startTransition(async () => {
      try {
        await bulkRejectUsers(fd);
        toast.success(`${selected.size} pengguna ditolak.`);
        setSelected(new Set());
        window.dispatchEvent(new CustomEvent("kosbaiti:bulk-reset"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menolak pengguna.");
      }
    });
  }

  function selectAllPending() {
    setSelected(new Set(pendingUserIds));
    window.dispatchEvent(
      new CustomEvent("kosbaiti:bulk-select-all", { detail: pendingUserIds })
    );
  }

  if (selected.size === 0) {
    return pendingUserIds.length > 0 ? (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Ada <strong>{pendingUserIds.length}</strong> pengajuan menunggu
        approval.{" "}
        <button
          type="button"
          onClick={selectAllPending}
          className="font-medium text-brand-700 hover:underline"
        >
          Pilih semua pending
        </button>{" "}
        untuk approve/reject sekaligus.
      </div>
    ) : null;
  }

  return (
    <div className="sticky bottom-3 z-30 mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-full border border-slate-300 bg-white px-4 py-2 shadow-lg">
      <div className="text-sm font-medium text-slate-700">
        {selected.size} dipilih
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runApprove}
          disabled={pending}
          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "..." : "Setujui semua"}
        </button>
        <button
          type="button"
          onClick={runReject}
          disabled={pending}
          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Tolak semua
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected(new Set());
            window.dispatchEvent(new CustomEvent("kosbaiti:bulk-reset"));
          }}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

type CheckboxProps = {
  userId: string;
};

/** Checkbox di setiap row user pending. */
export function BulkCheckbox({ userId }: CheckboxProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    function onReset() {
      setChecked(false);
    }
    function onSelectAll(e: Event) {
      const ev = e as CustomEvent<string[]>;
      if (ev.detail.includes(userId)) setChecked(true);
    }
    window.addEventListener("kosbaiti:bulk-reset", onReset);
    window.addEventListener("kosbaiti:bulk-select-all", onSelectAll);
    return () => {
      window.removeEventListener("kosbaiti:bulk-reset", onReset);
      window.removeEventListener("kosbaiti:bulk-select-all", onSelectAll);
    };
  }, [userId]);

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => {
        setChecked(e.target.checked);
        window.dispatchEvent(
          new CustomEvent("kosbaiti:select", {
            detail: { id: userId, checked: e.target.checked },
          })
        );
      }}
      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      aria-label="Pilih untuk bulk action"
    />
  );
}
