"use client";

import { useState } from "react";
import {
  testReminderAction,
  testEmailAction,
  testWaAction,
  previewReminderAction,
  checkFonnteDeviceAction,
  validateWaNumberAction,
  refreshWaLinkPreviewAction,
  type TestActionState,
} from "./actions";

type ReminderType = "H3" | "OVERDUE";

function ResultBox({ result }: { result: TestActionState | null }) {
  if (!result) return null;
  return (
    <div
      className={
        result.ok
          ? "mt-2 overflow-hidden rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "mt-2 overflow-hidden rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
      }
    >
      <div className="break-words">{result.message}</div>
      {result.detail && (
        <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-snug sm:text-xs">
          {result.detail}
        </pre>
      )}
    </div>
  );
}

export function TestActions() {
  const [reminderState, setReminderState] = useState<TestActionState | null>(null);
  const [emailState, setEmailState] = useState<TestActionState | null>(null);
  const [waState, setWaState] = useState<TestActionState | null>(null);
  const [previewState, setPreviewState] = useState<TestActionState | null>(null);
  const [deviceState, setDeviceState] = useState<TestActionState | null>(null);
  const [validateState, setValidateState] = useState<TestActionState | null>(null);
  const [previewCacheState, setPreviewCacheState] = useState<
    (TestActionState & { debuggerUrl?: string }) | null
  >(null);
  const [validateTo, setValidateTo] = useState("");
  const [previewTo, setPreviewTo] = useState("");
  const [previewType, setPreviewType] = useState<ReminderType>("H3");
  const [emailTo, setEmailTo] = useState("");
  const [waTo, setWaTo] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function runRefreshPreviewCache() {
    setLoading("previewCache");
    const result = await refreshWaLinkPreviewAction();
    setPreviewCacheState(result);
    // SELALU buka FB Debugger kalau URL-nya ada — scrape dilakukan server
    // Meta dari luar, jadi tetap berguna walau cek lokal gagal (loopback)
    // atau crawler diblok (FB Debugger justru menunjukkan 403-nya).
    if (result.debuggerUrl) {
      window.open(result.debuggerUrl, "_blank", "noopener,noreferrer");
    }
    setLoading(null);
  }

  async function runCheckDevice() {
    setLoading("device");
    setDeviceState(await checkFonnteDeviceAction());
    setLoading(null);
  }

  async function runValidate(e: React.FormEvent) {
    e.preventDefault();
    setLoading("validate");
    setValidateState(await validateWaNumberAction(validateTo));
    setLoading(null);
  }

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
          Auto pre-flight: cek device → validasi nomor di WA → kirim.
          Kalau salah satu gagal, kirim dibatalkan dengan alasan jelas.
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
        Kirim <strong>contoh pesan reminder</strong> (H3/OVERDUE) ke nomor
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
          <option value="H3">H3 (3 hari lagi)</option>
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

    {/* Diagnostic WA Fonnte */}
    <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
      <div className="text-sm font-semibold">🔍 Diagnostik WA Fonnte</div>
      <p className="mt-1 text-xs text-slate-600">
        Jika pesan WA "sent" di Fonnte tapi tidak sampai ke penerima,
        pakai 2 tools ini untuk cari penyebab:
      </p>

      {/* Check device status */}
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
        <div className="text-xs font-medium text-slate-700">
          1. Status device WA (gateway Fonnte)
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Pastikan device <strong>CONNECT</strong>. Kalau disconnect, semua
          pesan akan stuck di queue (state 0) sampai user reconnect di
          dashboard Fonnte.
        </p>
        <button
          type="button"
          onClick={runCheckDevice}
          disabled={loading === "device"}
          className="btn-primary mt-2 w-full"
        >
          {loading === "device" ? "Cek…" : "Cek status device"}
        </button>
        <ResultBox result={deviceState} />
      </div>

      {/* Refresh WA link preview cache */}
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
        <div className="text-xs font-medium text-slate-700">
          2. Refresh WA Link Preview Cache
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Kalau link <code>kosbaiti.com</code> di pesan WA tidak menampilkan
          preview card (thumbnail + judul), kemungkinan WhatsApp cache versi
          lama tanpa preview. Tombol ini cek OG metadata live + buka tab FB
          Sharing Debugger. Di sana klik <strong>"Scrape Again"</strong> 2x
          untuk paksa Meta refresh — cache WA akan ikut update dalam
          beberapa menit.
        </p>
        <button
          type="button"
          onClick={runRefreshPreviewCache}
          disabled={loading === "previewCache"}
          className="btn-primary mt-2 w-full"
        >
          {loading === "previewCache"
            ? "Cek OG metadata…"
            : "Cek & buka FB Debugger"}
        </button>
        <ResultBox result={previewCacheState} />
        {previewCacheState?.debuggerUrl && (
          // Fallback kalau popup diblok browser (window.open setelah await
          // bisa di-block). Admin tinggal klik manual.
          <a
            href={previewCacheState.debuggerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline"
          >
            Tab tidak terbuka? Buka FB Debugger manual →
          </a>
        )}
      </div>

      {/* Validate WA number */}
      <form
        onSubmit={runValidate}
        className="mt-3 rounded-md border border-slate-200 bg-white p-3"
      >
        <div className="text-xs font-medium text-slate-700">
          3. Validasi nomor target di WA
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Cek apakah nomor target benar-benar terdaftar di WhatsApp dan
          punya privasi yang mengizinkan menerima dari non-kontak.
          Nomor non-WA akan "sent" tapi tidak pernah sampai.
        </p>
        <input
          type="tel"
          required
          value={validateTo}
          onChange={(e) => setValidateTo(e.target.value)}
          placeholder="08xxxxxxxxxx"
          className="input mt-2"
        />
        <button
          type="submit"
          disabled={loading === "validate"}
          className="btn-primary mt-2 w-full"
        >
          {loading === "validate" ? "Cek…" : "Validasi nomor di WA"}
        </button>
        <ResultBox result={validateState} />
      </form>
    </div>
  </>
  );
}
