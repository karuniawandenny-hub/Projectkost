"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/expenses";
import { createExpense, type ExpenseState } from "./actions";

const initial: ExpenseState = {};
const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

function todayLocalISO(): string {
  // YYYY-MM-DD di zona waktu lokal (tidak pakai toISOString yang UTC).
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Menyimpan…" : "Simpan pengeluaran"}
    </button>
  );
}

export function ExpenseForm({
  kosList,
  defaultKosId,
}: {
  kosList: { id: string; name: string }[];
  defaultKosId?: string;
}) {
  const [state, formAction] = useFormState(createExpense, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      // Reset semua kecuali kosId default — biar pemilik bisa cepat input
      // beberapa pengeluaran berurutan untuk kos yang sama.
      const form = formRef.current;
      if (!form) return;
      const fields = ["category", "amount", "note"];
      for (const name of fields) {
        const el = form.elements.namedItem(name) as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | null;
        if (el) el.value = "";
      }
      const dateEl = form.elements.namedItem("date") as HTMLInputElement | null;
      if (dateEl) dateEl.value = todayLocalISO();
    }
  }, [state.success]);

  if (kosList.length === 0) {
    return (
      <div className="card text-sm text-slate-500">
        Tambahkan kos terlebih dulu di halaman <strong>Kos &amp; Kamar</strong>{" "}
        sebelum mencatat pengeluaran.
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Kos</label>
          <select
            name="kosId"
            defaultValue={defaultKosId ?? kosList[0].id}
            required
            className="input mt-1"
          >
            {kosList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Kategori</label>
          <select name="category" required defaultValue="" className="input mt-1">
            <option value="" disabled>
              Pilih kategori…
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Tanggal</label>
          <input
            type="date"
            name="date"
            required
            defaultValue={todayLocalISO()}
            className="input mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Nominal (Rp)
          </label>
          <input
            name="amount"
            required
            inputMode="numeric"
            placeholder="Mis. 750000"
            className="input mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">
          Catatan <span className="text-slate-400">(opsional)</span>
        </label>
        <textarea
          name="note"
          rows={2}
          placeholder="Mis. Tagihan PLN bulan Mei, no. meter 12345…"
          className="input mt-1"
        />
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
