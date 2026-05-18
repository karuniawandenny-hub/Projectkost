"use server";

import { requireUser } from "@/lib/session";
import { processReminders } from "@/lib/reminders";
import { normalizePhone } from "@/lib/phone";

export type TestActionState = {
  ok: boolean;
  message: string;
  detail?: string;
};

async function requireAdmin() {
  const me = await requireUser();
  if (me.role !== "ADMIN") throw new Error("FORBIDDEN");
  return me;
}

export async function testReminderAction(): Promise<TestActionState> {
  await requireAdmin();
  try {
    const result = await processReminders();
    return {
      ok: true,
      message: `Selesai. ${result.sent.length} reminder terkirim, ${result.skipped} dilewati, ${result.errors.length} error.`,
      detail: JSON.stringify(result, null, 2),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error tidak diketahui",
    };
  }
}

export async function testEmailAction(to: string): Promise<TestActionState> {
  await requireAdmin();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, message: "Format email tidak valid." };
  }
  const mode = (process.env.EMAIL_MODE ?? "dev").toLowerCase();
  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[test-email][dev] -> ${to}: ping`);
    return {
      ok: true,
      message:
        "Dev mode aktif — email tidak benar-benar dikirim. Cek terminal server untuk log.",
    };
  }
  if (mode !== "resend") {
    return { ok: false, message: `EMAIL_MODE='${mode}' tidak didukung.` };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, message: "RESEND_API_KEY atau EMAIL_FROM belum diset." };
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
        to,
        subject: "Test integrasi Kelola Kos",
        text:
          "Halo!\n\nIni email test dari Kelola Kos. Jika Anda menerima ini, integrasi Resend Anda berfungsi.\n\nTerima kasih.",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `Resend HTTP ${res.status}`, detail: body };
    }
    return { ok: true, message: `Email test dikirim ke ${to} via Resend.` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Gagal hubungi Resend",
    };
  }
}

export async function testWaAction(to: string): Promise<TestActionState> {
  await requireAdmin();
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false, message: "Format nomor HP tidak valid." };
  }
  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  const message =
    "Halo! Ini pesan test dari Kelola Kos. Jika Anda menerima ini, integrasi gateway WA Anda berfungsi.";

  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[test-wa][dev] -> ${normalized}: ${message}`);
    return {
      ok: true,
      message:
        "Dev mode aktif — WA tidak benar-benar dikirim. Cek terminal server.",
    };
  }
  if (mode === "fonnte") {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) {
      return { ok: false, message: "WA_GATEWAY_TOKEN belum diset." };
    }
    try {
      const target = normalized.startsWith("+") ? normalized.slice(1) : normalized;
      const form = new URLSearchParams();
      form.set("target", target);
      form.set("message", message);
      form.set("countryCode", "62");
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token },
        body: form,
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) {
        return { ok: false, message: `Fonnte HTTP ${res.status}`, detail: txt };
      }
      return { ok: true, message: `WA test dikirim ke ${normalized}.`, detail: txt };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Error" };
    }
  }
  // Generic gateway
  const url = process.env.WA_GATEWAY_URL;
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!url || !token) {
    return { ok: false, message: "WA gateway URL/TOKEN belum diset." };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone: normalized, message }),
    });
    if (!res.ok) {
      return { ok: false, message: `Gateway HTTP ${res.status}` };
    }
    return { ok: true, message: `WA test dikirim ke ${normalized}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}
