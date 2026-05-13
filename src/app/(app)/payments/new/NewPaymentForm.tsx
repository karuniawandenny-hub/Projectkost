"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitPayment, type PaymentSubmitState } from "../actions";
import { CameraInput } from "@/components/CameraInput";

const initial: PaymentSubmitState = {};

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Mengunggah…" : "Kirim bukti pembayaran"}
    </button>
  );
}

export function NewPaymentForm({
  defaultMonth,
  defaultYear,
  suggestedAmount,
}: {
  defaultMonth: number;
  defaultYear: number;
  suggestedAmount: number;
}) {
  const [state, formAction] = useFormState(submitPayment, initial);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Bulan</label>
          <select name="month" defaultValue={defaultMonth} className="input">
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Tahun</label>
          <input
            type="number"
            name="year"
            defaultValue={defaultYear}
            className="input"
            min={2020}
            max={2100}
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Nominal (Rp)</label>
        <input
          type="text"
          name="amount"
          defaultValue={suggestedAmount}
          inputMode="numeric"
          className="input"
          required
        />
      </div>

      <div>
        <label className="label">Catatan (opsional)</label>
        <textarea
          name="note"
          className="input"
          rows={2}
          placeholder="Mis. transfer dari rekening BCA a/n Andi"
        />
      </div>

      <CameraInput
        name="proof"
        required
        label="Bukti transfer / kuitansi"
        helper="Upload foto/file struk transfer. Format: JPG/PNG/PDF, maks 8 MB."
      />

      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state?.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
