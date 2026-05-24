/**
 * Pengiriman email sederhana untuk reset password.
 *
 * Mode (env EMAIL_MODE):
 *  - "dev"     (default): tidak mengirim apa-apa. URL reset dikembalikan ke
 *                         caller agar bisa ditampilkan di UI / log untuk testing.
 *  - "resend"            : kirim via Resend (https://resend.com).
 *                          Butuh env RESEND_API_KEY dan EMAIL_FROM
 *                          (mis. "Kelola Kos <noreply@kelolakos.id>").
 */

import { randomBytes, createHash } from "crypto";

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isDevEmailMode(): boolean {
  return (process.env.EMAIL_MODE ?? "dev") === "dev";
}

export type SendEmailResult = {
  delivered: boolean;
  /** Hanya terisi di mode dev — link reset agar bisa ditampilkan di halaman. */
  devLink?: string;
  error?: string;
};

export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string
): Promise<SendEmailResult> {
  const mode = process.env.EMAIL_MODE ?? "dev";

  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[email][dev] reset ${toEmail} -> ${resetUrl}`);
    return { delivered: true, devLink: resetUrl };
  }

  if (mode === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      return {
        delivered: false,
        error: "RESEND_API_KEY / EMAIL_FROM belum diset.",
      };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: toEmail,
          subject: "Reset password Kos Baiti",
          html: buildResetHtml(resetUrl),
          text:
            "Klik link berikut untuk reset password Anda (berlaku 1 jam):\n" +
            resetUrl +
            "\n\nAbaikan email ini jika Anda tidak meminta reset.",
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { delivered: false, error: `Resend HTTP ${res.status}: ${body}` };
      }
      return { delivered: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Resend error:", err);
      return { delivered: false, error: "Gagal hubungi Resend." };
    }
  }

  return { delivered: false, error: `EMAIL_MODE tidak dikenal: ${mode}` };
}

function buildResetHtml(resetUrl: string): string {
  const safe = resetUrl.replace(/"/g, "&quot;");
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 8px 0">Reset password Kos Baiti</h2>
      <p style="margin:0 0 16px 0;color:#475569">
        Kami menerima permintaan untuk mengatur ulang password akun Anda.
        Klik tombol di bawah untuk membuat password baru. Link berlaku 1 jam.
      </p>
      <p style="margin:24px 0">
        <a href="${safe}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Reset password
        </a>
      </p>
      <p style="margin:0 0 8px 0;color:#475569;font-size:13px">
        Atau salin URL berikut:
      </p>
      <p style="word-break:break-all;color:#1e293b;font-size:13px">${safe}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
      <p style="margin:0;color:#64748b;font-size:12px">
        Abaikan email ini jika Anda tidak meminta reset password.
      </p>
    </div>
  `;
}

// ============================================================================
// Email: Pemberitahuan penghuni di-assign ke kamar (welcome email)
// ============================================================================

export type TenantAssignedEmailParams = {
  tenantName: string;
  kosName: string;
  roomName: string;
  startDate: Date;
  monthlyPrice: number;
  /** URL absolut ke halaman login (mis. https://www.kosbaiti.com/login). */
  loginUrl: string;
};

/**
 * Kirim email welcome ke penghuni saat di-assign ke kamar oleh pemilik.
 * Non-throwing: gagal kirim hanya menghasilkan `delivered:false`, transaksi
 * assignment di sisi caller tidak boleh dibatalkan karena email gagal.
 */
export async function sendTenantAssignedEmail(
  toEmail: string,
  params: TenantAssignedEmailParams
): Promise<SendEmailResult> {
  const mode = process.env.EMAIL_MODE ?? "dev";
  const subject = `Selamat datang di ${params.kosName} — Kamar ${params.roomName}`;
  const html = buildTenantAssignedHtml(params);
  const text = buildTenantAssignedText(params);

  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[email][dev] assigned ${toEmail} -> ${params.kosName}/${params.roomName}`);
    return { delivered: true };
  }

  if (mode === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      return {
        delivered: false,
        error: "RESEND_API_KEY / EMAIL_FROM belum diset.",
      };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ from, to: toEmail, subject, html, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { delivered: false, error: `Resend HTTP ${res.status}: ${body}` };
      }
      return { delivered: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Resend assigned-email error:", err);
      return { delivered: false, error: "Gagal hubungi Resend." };
    }
  }

  return { delivered: false, error: `EMAIL_MODE tidak dikenal: ${mode}` };
}

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatTanggalId(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function buildTenantAssignedHtml(p: TenantAssignedEmailParams): string {
  const safeLogin = p.loginUrl.replace(/"/g, "&quot;");
  const safeName = escapeHtml(p.tenantName);
  const safeKos = escapeHtml(p.kosName);
  const safeRoom = escapeHtml(p.roomName);
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;background:#f8fafc">
      <div style="background:#ffffff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:8px;padding:16px;margin:0 0 20px 0;text-align:center">
          <div style="color:#fff;font-size:14px;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85">Kos Baiti</div>
          <div style="color:#fff;font-size:22px;font-weight:700;margin-top:4px">Selamat datang, ${safeName}!</div>
        </div>

        <p style="margin:0 0 16px 0;color:#475569;font-size:15px;line-height:1.55">
          Pemilik kos telah menempatkan Anda di kamar berikut. Mulai hari ini Anda dapat tinggal &amp; menggunakan dashboard untuk pembayaran serta laporan komplain.
        </p>

        <table style="width:100%;border-collapse:collapse;margin:8px 0 20px 0;background:#f1f5f9;border-radius:8px;overflow:hidden">
          <tr><td style="padding:10px 14px;color:#64748b;font-size:13px">Kos</td><td style="padding:10px 14px;font-weight:600;text-align:right">${safeKos}</td></tr>
          <tr><td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0">Kamar</td><td style="padding:10px 14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0">${safeRoom}</td></tr>
          <tr><td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0">Mulai sewa</td><td style="padding:10px 14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0">${formatTanggalId(p.startDate)}</td></tr>
          <tr><td style="padding:10px 14px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0">Tagihan / bulan</td><td style="padding:10px 14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0;color:#2563eb">${formatRupiah(p.monthlyPrice)}</td></tr>
        </table>

        <h3 style="margin:24px 0 12px 0;font-size:15px;color:#0f172a">Tiga pesan penting dari kami</h3>

        <div style="border-left:3px solid #10b981;background:#ecfdf5;padding:12px 14px;border-radius:0 8px 8px 0;margin:0 0 10px 0">
          <div style="font-weight:600;color:#065f46;font-size:14px;margin-bottom:2px">🧹 Jaga kebersihan kamar</div>
          <div style="color:#047857;font-size:13px;line-height:1.5">Rapikan kamar &amp; area bersama setiap hari. Buang sampah ke tempatnya. Kebersihan adalah sebagian dari iman dan kenyamanan bersama.</div>
        </div>

        <div style="border-left:3px solid #f59e0b;background:#fffbeb;padding:12px 14px;border-radius:0 8px 8px 0;margin:0 0 10px 0">
          <div style="font-weight:600;color:#92400e;font-size:14px;margin-bottom:2px">🔒 Jaga keamanan</div>
          <div style="color:#b45309;font-size:13px;line-height:1.5">Selalu kunci pintu kamar saat keluar. Jangan memberi kunci/akses ke orang luar. Laporkan tamu menginap ke pemilik. Jaga barang berharga Anda.</div>
        </div>

        <div style="border-left:3px solid #2563eb;background:#eff6ff;padding:12px 14px;border-radius:0 8px 8px 0;margin:0 0 18px 0">
          <div style="font-weight:600;color:#1e3a8a;font-size:14px;margin-bottom:2px">💳 Bayar iuran tepat waktu</div>
          <div style="color:#1e40af;font-size:13px;line-height:1.5">Sistem akan otomatis buat tagihan bulanan sesuai tanggal mulai sewa Anda. Bayar tepat waktu memudahkan kami menyediakan layanan terbaik. Anda akan dapat reminder H-7, H-3, dan H-1 sebelum jatuh tempo.</div>
        </div>

        <p style="margin:20px 0 12px 0;text-align:center">
          <a href="${safeLogin}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
            Buka Dashboard Saya
          </a>
        </p>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="margin:0;color:#64748b;font-size:12px;text-align:center;line-height:1.5">
          Email ini dikirim otomatis dari sistem Kos Baiti.<br />
          Pertanyaan? Hubungi pemilik kos Anda secara langsung.
        </p>
      </div>
    </div>
  `;
}

function buildTenantAssignedText(p: TenantAssignedEmailParams): string {
  return [
    `Selamat datang di Kos Baiti, ${p.tenantName}!`,
    ``,
    `Pemilik kos telah menempatkan Anda di kamar berikut:`,
    `- Kos:         ${p.kosName}`,
    `- Kamar:       ${p.roomName}`,
    `- Mulai sewa:  ${formatTanggalId(p.startDate)}`,
    `- Tagihan/bln: ${formatRupiah(p.monthlyPrice)}`,
    ``,
    `Tiga pesan penting dari kami:`,
    ``,
    `1) Jaga kebersihan kamar`,
    `   Rapikan kamar & area bersama setiap hari. Buang sampah ke tempatnya.`,
    ``,
    `2) Jaga keamanan`,
    `   Kunci pintu saat keluar. Jangan beri akses ke orang luar.`,
    `   Laporkan tamu menginap ke pemilik. Jaga barang berharga Anda.`,
    ``,
    `3) Bayar iuran tepat waktu`,
    `   Sistem otomatis buat tagihan bulanan sesuai tanggal mulai sewa.`,
    `   Anda akan dapat reminder H-7, H-3, dan H-1 sebelum jatuh tempo.`,
    ``,
    `Buka dashboard Anda: ${p.loginUrl}`,
    ``,
    `— Kos Baiti`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
