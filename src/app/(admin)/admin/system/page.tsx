import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { TestActions } from "./TestActions";
import { CronUrlCard } from "./CronUrlCard";
import { MaintenanceWaToggle } from "./MaintenanceWaToggle";
import { BackupCard } from "./BackupCard";
import { getSettingBool, SETTING_KEYS } from "@/lib/settings";
import { listBackups } from "@/lib/backup";

function getBaseUrl() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

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
    maintWaEnabled,
    backups,
    recentFailures,
  ] = await Promise.all([
    prisma.payment.count(),
    prisma.payment.count({ where: { status: "DUE" } }),
    prisma.reminderLog.count(),
    prisma.reminderLog.count({
      where: { sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.gatewayTransaction.count(),
    prisma.gatewayTransaction.count({ where: { status: "PAID" } }),
    getSettingBool(SETTING_KEYS.MAINTENANCE_WA_ENABLED, false),
    listBackups(),
    prisma.auditLog.count({
      where: {
        action: "BACKUP.FAIL",
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const emailMode = process.env.EMAIL_MODE ?? "dev";
  const waMode = process.env.OTP_MODE ?? "dev";
  const gatewayMode = process.env.PAYMENT_GATEWAY ?? "mock";
  const cronSecret = process.env.CRON_SECRET;
  const cronConfigured = !!cronSecret;
  const emailKey = !!process.env.RESEND_API_KEY;
  const waKey = !!process.env.WA_GATEWAY_TOKEN;
  const midtransKey = !!process.env.MIDTRANS_SERVER_KEY;

  const cronBillsUrl = cronSecret
    ? `${getBaseUrl()}/api/cron/bills?token=${cronSecret}`
    : "";
  const cronUrl = cronSecret
    ? `${getBaseUrl()}/api/cron/reminders?token=${cronSecret}`
    : "";
  const cronBackupUrl = cronSecret
    ? `${getBaseUrl()}/api/cron/backup?token=${cronSecret}`
    : "";

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
          <div className="mt-4 border-t border-slate-200 pt-3">
            <MaintenanceWaToggle initialEnabled={maintWaEnabled} />
          </div>
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

        <div className="card md:col-span-2">
          <h2 className="font-semibold">Cron / Scheduled Reminder</h2>
          <div className="mt-2">
            <StatusPill ok={cronConfigured} label={cronConfigured ? "configured" : "no secret"} />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {cronConfigured
              ? "CRON_SECRET ter-set. Endpoint /api/cron/reminders siap dipanggil dari cron eksternal."
              : "CRON_SECRET belum di-set. Reminder tidak bisa dijadwalkan."}
          </p>
          <div className="mt-3">
            <CronUrlCard url={cronUrl} configured={cronConfigured} />
          </div>
          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-700">
              Cron auto-generate tagihan (baru)
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Jadwalkan di cron-job.org tiap hari 00:30 WIB. Tagihan periode
              baru akan otomatis muncul saat anniversary tenancy lewat — tidak
              perlu menunggu owner/tenant login.
            </p>
            <div className="mt-2">
              <CronUrlCard url={cronBillsUrl} configured={cronConfigured} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <BackupCard
          backups={backups.map((b) => ({
            name: b.name,
            size: b.size,
            modifiedAt: b.modifiedAt.toISOString(),
          }))}
          cronConfigured={cronConfigured}
          cronUrl={cronBackupUrl}
        />
        {recentFailures > 0 && (
          <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            ⚠️ {recentFailures} kegagalan backup dalam 7 hari terakhir. Cek{" "}
            <a href="/admin/audit?action=BACKUP.FAIL" className="underline">
              audit log
            </a>{" "}
            untuk detail.
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Total tagihan" value={bills} />
        <Stat label="Tagihan DUE (belum upload)" value={duePayments} />
        <Stat label="Reminder log total" value={totalReminders} href="/admin/reminders" />
        <Stat label="Reminder hari ini" value={remindersToday} href="/admin/reminders" />
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
        <details className="mt-2" open>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            ⏰ Setup cron-job.org (recommended, gratis)
          </summary>
          <div className="mt-2 ml-5 space-y-2 text-sm text-slate-700">
            <p>
              Setup reminder otomatis tiap pagi <strong>09:00 WIB</strong>{" "}
              dengan cron-job.org. Gratis, tidak perlu kartu kredit.
            </p>
            <ol className="ml-5 list-decimal space-y-2">
              <li>
                Buka{" "}
                <a
                  href="https://cron-job.org/en/signup/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  cron-job.org/signup
                </a>{" "}
                → daftar dengan email Anda → verifikasi email.
              </li>
              <li>
                Login → klik tombol <strong>"CREATE CRONJOB"</strong> (kanan atas).
              </li>
              <li>
                Isi form:
                <ul className="ml-5 mt-1 list-disc space-y-1 text-xs text-slate-600">
                  <li>
                    <strong>Title</strong>: <code>Kos Baiti — Reminder Pembayaran</code>
                  </li>
                  <li>
                    <strong>URL</strong>: paste URL dari card "Cron / Scheduled
                    Reminder" di atas (gunakan tombol Salin)
                  </li>
                  <li>
                    <strong>Schedule</strong>: pilih tab "Every day at" → set{" "}
                    <code>09:00</code> dengan timezone <code>Asia/Jakarta</code>
                  </li>
                  <li>
                    <strong>Request method</strong>: <code>GET</code> (default)
                  </li>
                  <li>
                    Tab <strong>Notifications</strong>: aktifkan "Notify on failure"
                    supaya Anda dapat email kalau cron gagal
                  </li>
                </ul>
              </li>
              <li>
                Klik <strong>CREATE</strong>. Cron langsung aktif.
              </li>
              <li>
                Klik nama cronjob → tab <strong>"History"</strong> untuk lihat
                eksekusi. Status <code>200 OK</code> = sukses.
              </li>
              <li>
                Verifikasi: balik ke halaman ini (refresh), atau cek{" "}
                <a href="/admin/reminders" className="text-brand-700 hover:underline">
                  /admin/reminders
                </a>{" "}
                untuk lihat log reminder yang sudah dikirim.
              </li>
            </ol>
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
              💡 <strong>Test sekarang</strong>: klik tombol "Picu reminder
              manual" di section Test integrasi di atas untuk simulasi cron.
              Idempoten — kalau sudah dikirim hari ini, tidak akan dobel.
            </div>
          </div>
        </details>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            ⚙️ Alternatif: cron lain (Vercel, server linux, EasyCron)
          </summary>
          <div className="mt-2 ml-5 space-y-2 text-sm text-slate-700">
            <p>
              <strong>Vercel Cron</strong>: file <code>vercel.json</code> di repo
              sudah menjadwalkan <code>0 2 * * *</code> (09:00 WIB harian).
              Otomatis aktif setelah deploy ke Vercel.
            </p>
            <p>
              <strong>Self-hosted</strong>: jadwalkan di crontab linux:
            </p>
            <pre className="rounded bg-slate-100 p-2 text-xs">{`0 9 * * * curl -X POST https://your-domain.com/api/cron/reminders -H "Authorization: Bearer $CRON_SECRET"`}</pre>
            <p>
              <strong>EasyCron</strong>:{" "}
              <a
                href="https://www.easycron.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                easycron.com
              </a>{" "}
              (mirip cron-job.org, free tier lebih kecil).
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </>
  );
  if (href) {
    return (
      <a href={href} className="card hover:bg-slate-50 transition-colors">
        {content}
      </a>
    );
  }
  return <div className="card">{content}</div>;
}
