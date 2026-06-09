"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteExpense, type ExpenseState } from "./actions";

const initial: ExpenseState = {};

function Btn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm("Hapus pengeluaran ini?")) e.preventDefault();
      }}
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Menghapus…" : "Hapus"}
    </button>
  );
}

export function DeleteExpenseButton({ id }: { id: string }) {
  const [, formAction] = useFormState(deleteExpense, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Btn />
    </form>
  );
}
