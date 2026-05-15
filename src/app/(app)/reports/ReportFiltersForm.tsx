"use client";

import { useState } from "react";
import { MONTH_LABELS, type ReportFilters } from "@/lib/reports";

const YEAR_RANGE = (() => {
  const cur = new Date().getFullYear();
  const arr: number[] = [];
  for (let y = cur - 4; y <= cur + 1; y++) arr.push(y);
  return arr;
})();

type Props = {
  initial: ReportFilters;
  kosOptions: { id: string; name: string }[];
};

export function ReportFiltersForm({ initial, kosOptions }: Props) {
  const [mode, setMode] = useState<"single" | "range">(initial.mode);

  return (
    <form method="get" action="/reports" className="card space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Periode:</span>
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`rounded-md px-3 py-1 text-sm ${
              mode === "single"
                ? "bg-brand-600 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Bulan tunggal
          </button>
          <button
            type="button"
            onClick={() => setMode("range")}
            className={`rounded-md px-3 py-1 text-sm ${
              mode === "range"
                ? "bg-brand-600 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Rentang bulan
          </button>
        </div>
        <input type="hidden" name="mode" value={mode} />
      </div>

      {mode === "single" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Bulan</label>
            <select name="month" defaultValue={initial.month} className="input">
              {MONTH_LABELS.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tahun</label>
            <select name="year" defaultValue={initial.year} className="input">
              {YEAR_RANGE.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-500">
              Dari
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <select
                name="fromMonth"
                defaultValue={initial.fromMonth}
                className="input"
              >
                {MONTH_LABELS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                name="fromYear"
                defaultValue={initial.fromYear}
                className="input"
              >
                {YEAR_RANGE.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium text-slate-500">
              Sampai
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <select
                name="toMonth"
                defaultValue={initial.toMonth}
                className="input"
              >
                {MONTH_LABELS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                name="toYear"
                defaultValue={initial.toYear}
                className="input"
              >
                {YEAR_RANGE.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Kos</label>
          <select
            name="kosId"
            defaultValue={initial.kosId}
            className="input"
          >
            <option value="all">Semua kos</option>
            {kosOptions.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status pembayaran</label>
          <select
            name="status"
            defaultValue={initial.status}
            className="input"
          >
            <option value="all">Semua status</option>
            <option value="VERIFIED">Lunas</option>
            <option value="PENDING">Menunggu verifikasi</option>
            <option value="REJECTED">Ditolak</option>
            <option value="UNPAID">Belum bayar</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary">
          Tampilkan laporan
        </button>
        <a href="/reports" className="btn-secondary">
          Reset
        </a>
      </div>
    </form>
  );
}
