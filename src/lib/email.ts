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
          subject: "Reset password Kelola Kos",
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
      <h2 style="margin:0 0 8px 0">Reset password Kelola Kos</h2>
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
