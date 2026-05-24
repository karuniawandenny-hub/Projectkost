"use client";

import { useState } from "react";
import {
  testReminderAction,
  testEmailAction,
  testWaAction,
  previewReminderAction,
  type TestActionState,
} from "./actions";

type ReminderType = "H7" | "H3" | "H1" | "OVERDUE";

function ResultBox({ result }: { result: TestActionState | null }) {
  if (!result) return null;
  return (
    <div
      className={
        result.ok
          ? "mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
      }
    >
      {result.message}
      {result.detail && (
        <pre className="mt-1 whitespace-pre-wrap text-xs">{result.detail}</pre>
      )}
    </div>
  );
}

export function TestActions() {
  const [reminderState, setReminderState] = useState<TestActionState | null>(null);
  const [emailState, setEmailState] = useState<TestActionState | null>(null);
  const [waState, setWaState] = useState<TestActionState | null>(null);
  const [previewState, setPreviewState] = useState<TestActionState | null>(null);
  const [previewTo, setPreviewTo] = useState("");
  const [previewType, setPreviewType] = useState<ReminderType>("H7");
  const [emailTo, setEmailTo] = useState("");
  const [waTo, setWaTo] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function runReminders() {
    setLoading("reminders");
    setReminderState(await testReminderAction());
    setLoading(null);
  }

  async function runEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading("email");
    setEmailState(await testEmailAction(emailTo));
    setLoading(null);
  }

  async function runWa(e: React.FormEvent) {
    e.preventDefault();
    setLoading("wa");
    setWaState(await testWaAction(waTo));
    setLoading(null);
  }

  async function runPreview(e: React.FormEvent) {
    e.preventDefault();
    setLoading("preview");
    setPreviewState(await previewReminderAction(previewTo, previewType));
    setLoading(null);
  }

  return (
  <>
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Reminder */}
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="text-sm font-semibold">Picu reminder cron</div>
        <p className="mt-1 text-xs text-slate-600">
          Jalankan <code>processReminders()</code> sekali sekarang.
        </p>
        <button
          onClick={runReminders}
          disabled={loading === "reminders"}
          className="btn-primary mt-3 w-full"
        >
          {loading === "reminders" ? "Memproses…" : "Jalankan reminder"}
        </button>
        <ResultBox result={reminderState} />
      </div>

      {/* Email test */}
      <form
        onSubmit={runEmail}
        className="rounded-lg border border-slate-200 p-3"
      >
        <div className="text-sm font-semibold">Test email</div>
        <p className="mt-1 text-xs text-slate-600">
          Kirim email "ping" ke alamat di bawah via mode aktif.
        </p>
        <input
          type="email"
          required
          value={emailTo}
          onChange={(e) => setEmailTo(e.target.value)}
          placeholder="anda@email.com"
          className="input mt-2"
        />
        <button
          type="submit"
          disabled={loading === "email"}
          className="btn-primary mt-2 w-full"
        >
          {loading === "email" ? "Mengirim…" : "Kirim email test"}
        </button>
        <ResultBox result={emailState} />
      </form>

      {/* WA test */}
      <form onSubmit={runWa} className="rounded-lg border border-slate-200 p-3">
        <div className="text-sm font-semibold">Test WhatsApp</div>
        <p className="mt-1 text-xs text-slate-600">
          Kirim WA "ping" ke nomor di bawah via mode aktif.
        </p>
        <input
          type="tel"
          required
          value={waTo}
          onChange={(e) => setWaTo(e.target.value)}
          placeholder="08xxxxxxxxxx"
          className="input mt-2"
        />
        <button
          type="submit"
          disabled={loading === "wa"}
          className="btn-primary mt-2 w-full"
        >
          {loading === "wa" ? "Mengirim…" : "Kirim WA test"}
        </button>
        <ResultBox result={waState} />
      </form>
    </div>

    {/* Preview reminder per tipe */}
    <form
      onSubmit={runPreview}
      className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3"
    >
      <div className="text-sm font-semibold">
        🧪 Preview reminder per tipe
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Kirim <strong>contoh pesan reminder</strong> (H7/H3/H1/OVERDUE) ke nomor
        Anda dengan data dummy (Penghuni Test / Kos Baiti / Kamar A1 / Rp 1jt).
        Format pesan persis seperti reminder asli — untuk verifikasi tampilan
        sebelum cron jalan. Tidak buat ReminderLog, tidak mengganggu data.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <input
          type="tel"
          required
          value={previewTo}
          onChange={(e) => setPreviewTo(e.target.value)}
          placeholder="Nomor HP target: 08xxxxxxxxxx"
          className="input"
        />
        <select
          value={previewType}
          onChange={(e) => setPreviewType(e.target.value as ReminderType)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="H7">H7 (7 hari lagi)</option>
          <option value="H3">H3 (3 hari lagi)</option>
          <option value="H1">H1 (besok)</option>
          <option value="OVERDUE">OVERDUE (terlambat)</option>
        </select>
        <button
          type="submit"
          disabled={loading === "preview"}
          className="btn-primary whitespace-nowrap"
        >
          {loading === "preview" ? "Mengirim…" : "Kirim preview"}
        </button>
      </div>
      <ResultBox result={previewState} />
    </form>
  </>
  );
}
