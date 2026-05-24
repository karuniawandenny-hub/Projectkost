import { prisma } from "@/lib/prisma";
import { TestActions } from "./TestActions";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "badge-green"
          : "badge-yellow"
      }
    >
      {ok ? "Aktif: " : "Dev mode: "}
      {label}
    </span>
  );
}

export default async function AdminSystemPage() {
  const [
    bills,
    duePayments,
    totalReminders,
    remindersToday,
    totalGatewayTx,
    paidGatewayTx,
  ] = await Promise.all([
    prisma.payment.count(),
    prisma.payment.count({ where: { status: "DUE" } }),
    prisma.reminderLog.count(),
    prisma.reminderLog.count({
      where: { sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.gatewayTransaction.count(),
    prisma.gatewayTransaction.count({ where: { status: "PAID" } }),
  ]);

  const emailMode = process.env.EMAIL_MODE ?? "dev";
  const waMode = process.env.OTP_MODE ?? "dev";
  const gatewayMode = process.env.PAYMENT_GATEWAY ?? "mock";
  const cronConfigured = !!process.env.CRON_SECRET;
  const emailKey = !!process.env.RESEND_API_KEY;
  const waKey = !!process.env.WA_GATEWAY_TOKEN;
  const midtransKey = !!process.env.MIDTRANS_SERVER_KEY;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sistem & Integrasi</h1>
        <p className="text-slate-600">
          Status konfigurasi gateway, reminder, dan pembayaran otomatis.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Email (Reminder + Reset password)</h2>
          <div className="mt-2">
            <StatusPill
              ok={emailMode !== "dev" && emailKey}
              label={emailMode}
            />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Mode aktif: <code>{emailMode}</code>.{" "}
            {emailMode === "dev"
              ? "Email tidak benar-benar dikirim. Set EMAIL_MODE=resend + RESEND_API_KEY untuk produksi."
              : emailKey
                ? "Resend siap mengirim email."
                : "Resend mode aktif tapi RESEND_API_KEY kosong."}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            EMAIL_FROM: {process.env.EMAIL_FROM || "(belum diset)"}
          </p>
        </div>

        <div className="card">
          <h2 className="font-semibold">WhatsApp (Reminder)</h2>
          <div className="mt-2">
            <StatusPill ok={waMode !== "dev" && waKey} label={waMode} />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Mode aktif: <code>{waMode}</code>.{" "}
            {waMode === "dev"
              ? "WA tidak dikirim, hanya tercetak di log dev. Set OTP_MODE=fonnte + WA_GATEWAY_TOKEN."
              : waKey
                ? "Gateway WA siap mengirim pesan."
                : "Token belum diset."}
          </p>
        </div>

        <div className="card">
          <h2 className="font-semibold">Payment Gateway</h2>
          <div className="mt-2">
            <StatusPill
              ok={gatewayMode !== "mock" && (gatewayMode !== "midtrans" || midtransKey)}
              label={gatewayMode}
            />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Mode aktif: <code>{gatewayMode}</code>.{" "}
            {gatewayMode === "mock"
              ? "Mode demo: transaksi langsung di-paid via webhook lokal. Untuk produksi, ganti ke midtrans."
              : gatewayMode === "midtrans"
                ? midtransKey
                  ? `Midtrans aktif (${process.env.MIDTRANS_PROD === "1" ? "PRODUCTION" : "SANDBOX"}).`
                  : "MIDTRANS_SERVER_KEY belum diset."
                : "Provider tidak dikenal."}
          </p>
        </div>

        <div className="card">
          <h2 className="font-semibold">Cron / Scheduled Reminder</h2>
          <div className="mt-2">
            <StatusPill ok={cronConfigured} label={cronConfigured ? "configured" : "no secret"} />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {cronConfigured
              ? "CRON_SECRET ter-set. Endpoint /api/cron/reminders siap dipanggil."
              : "CRON_SECRET belum di-set di .env. Reminder tidak bisa dijadwalkan."}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Vercel Cron schedule: <code>0 2 * * *</code> (09:00 WIB harian).
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Total tagihan" value={bills} />
        <Stat label="Tagihan DUE (belum upload)" value={duePayments} />
        <Stat label="Reminder log total" value={totalReminders} />
        <Stat label="Reminder hari ini" value={remindersToday} />
        <Stat label="Transaksi gateway" value={totalGatewayTx} />
        <Stat label="Gateway PAID" value={paidGatewayTx} />
      </section>

      <section className="card">
        <h2 className="font-semibold">Test integrasi</h2>
        <p className="mt-1 text-sm text-slate-600">
          Picu manual untuk verifikasi konfigurasi. Tidak mempengaruhi
          jadwal cron normal.
        </p>
        <div className="mt-4">
          <TestActions />
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold">Setup cepat (panduan)</h2>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            🔵 Resend (Email)
          </summary>
          <ol className="mt-2 ml-5 list-decimal space-y-1 text-sm text-slate-700">
            <li>
              Daftar gratis di{" "}
              <a
                href="https://resend.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                resend.com
              </a>{" "}
              (3000 email/bulan free).
            </li>
            <li>
              API Keys → <code>Create API Key</code> → salin token{" "}
              <code>re_xxxxx</code>.
            </li>
            <li>
              (Opsional) Domain → verifikasi domain Anda untuk kirim dari
              email kustom. Tanpa verify, hanya bisa kirim ke email akun
              Resend Anda sendiri (cukup untuk test).
            </li>
            <li>
              Set di <code>.env</code>:
              <pre className="mt-1 rounded bg-slate-100 p-2 text-xs">{`EMAIL_MODE="resend"
RESEND_API_KEY="re_xxxxxxxxxxxx"
EMAIL_FROM="Kos Baiti <noreply@yourdomain.com>"`}</pre>
            </li>
            <li>Restart dev server, lalu klik "Test email" di atas.</li>
          </ol>
        </details>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            🟢 Fonnte (WhatsApp)
          </summary>
          <ol className="mt-2 ml-5 list-decimal space-y-1 text-sm text-slate-700">
            <li>
              Daftar di{" "}
              <a
                href="https://fonnte.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                fonnte.com
              </a>
              .
            </li>
            <li>
              Tambah device baru → pindai QR code dengan WhatsApp di HP
              yang akan dipakai mengirim.
            </li>
            <li>Salin Device Token dari dashboard Fonnte.</li>
            <li>
              Set di <code>.env</code>:
              <pre className="mt-1 rounded bg-slate-100 p-2 text-xs">{`OTP_MODE="fonnte"
WA_GATEWAY_TOKEN="xxxxxxxxxxxxxxxx"`}</pre>
            </li>
            <li>Restart dev server, klik "Test WA" di atas.</li>
          </ol>
        </details>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            🟣 Midtrans (Payment Gateway)
          </summary>
          <ol className="mt-2 ml-5 list-decimal space-y-1 text-sm text-slate-700">
            <li>
              Daftar di{" "}
              <a
                href="https://midtrans.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                midtrans.com
              </a>
              .
            </li>
            <li>
              Setelah login, ada dua environment: <strong>Sandbox</strong>{" "}
              (untuk testing) dan <strong>Production</strong>.
            </li>
            <li>
              Settings → Access Keys → salin <strong>Server Key</strong> dan{" "}
              <strong>Client Key</strong>.
            </li>
            <li>
              Settings → Configuration → Payment Notification URL:
              <code className="block mt-1 break-all bg-slate-100 p-1 text-xs">
                https://your-domain.com/api/webhooks/payment
              </code>
            </li>
            <li>
              Set di <code>.env</code>:
              <pre className="mt-1 rounded bg-slate-100 p-2 text-xs">{`PAYMENT_GATEWAY="midtrans"
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxxx"
MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxxx"
MIDTRANS_PROD="0"`}</pre>
            </li>
            <li>Restart, lalu klik "Bayar online" di /payments tenant.</li>
          </ol>
        </details>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            ⏰ Cron Schedule
          </summary>
          <div className="mt-2 ml-5 space-y-2 text-sm text-slate-700">
            <p>
              <strong>Vercel Cron</strong>: file <code>vercel.json</code> di repo
              sudah menjadwalkan <code>0 2 * * *</code> (09:00 WIB harian).
              Otomatis aktif setelah deploy ke Vercel. Pastikan{" "}
              <code>CRON_SECRET</code> ter-set di Environment Variables proyek
              Vercel (Vercel Cron otomatis kirim header{" "}
              <code>Authorization: Bearer {`<CRON_SECRET>`}</code>).
            </p>
            <p>
              <strong>Self-hosted</strong>: jadwalkan di crontab linux:
            </p>
            <pre className="rounded bg-slate-100 p-2 text-xs">{`0 9 * * * curl -X POST https://your-domain.com/api/cron/reminders -H "Authorization: Bearer $CRON_SECRET"`}</pre>
            <p>
              <strong>Alternatif gratis</strong>:{" "}
              <a
                href="https://cron-job.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                cron-job.org
              </a>{" "}
              atau{" "}
              <a
                href="https://www.easycron.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                EasyCron
              </a>
              .
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
