"use client";

import { useState } from "react";
import {
  testReminderAction,
  testEmailAction,
  testWaAction,
  type TestActionState,
} from "./actions";

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

  return (
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
  );
}
