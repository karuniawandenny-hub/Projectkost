"use server";

import { requireUser } from "@/lib/session";
import {
  processReminders,
  buildReminderMessage,
  type ReminderType,
} from "@/lib/reminders";
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
        subject: "Test integrasi Kos Baiti",
        text:
          "Halo!\n\nIni email test dari Kos Baiti. Jika Anda menerima ini, integrasi Resend Anda berfungsi.\n\nTerima kasih.",
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

/**
 * Preview reminder per tipe (H7/H3/H1/OVERDUE) ke nomor HP target.
 *
 * Pakai data dummy (Test User / Kos Baiti / Kamar A1 / Rp 1.000.000 /
 * dueDate dihitung dari hari ini sesuai tipe). Tidak buat ReminderLog,
 * tidak ganggu tagihan real. Murni untuk verifikasi format pesan.
 */
export async function previewReminderAction(
  to: string,
  type: ReminderType
): Promise<TestActionState> {
  await requireAdmin();
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false, message: "Format nomor HP tidak valid." };
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const offsetDays: Record<ReminderType, number> = {
    H7: 7,
    H3: 3,
    H1: 1,
    OVERDUE: -1,
  };
  const dueDate = new Date(
    todayStart.getTime() + offsetDays[type] * 86_400_000
  );

  const { body } = buildReminderMessage({
    type,
    tenantName: "Penghuni Test",
    kosName: "Kos Baiti (preview)",
    roomName: "A1",
    periodMonth: today.getMonth() + 1,
    periodYear: today.getFullYear(),
    amount: 1_000_000,
    dueDate,
    daysOverdue: type === "OVERDUE" ? 1 : undefined,
  });

  const previewBody = `[PREVIEW ${type}]\n\n${body}`;

  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[preview-reminder][dev] -> ${normalized} (${type}): ${previewBody.slice(0, 80)}…`);
    return {
      ok: true,
      message: "Dev mode — pesan tidak benar-benar dikirim. Cek log server.",
      detail: previewBody,
    };
  }
  if (mode === "fonnte") {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) return { ok: false, message: "WA_GATEWAY_TOKEN belum diset." };
    try {
      const target = normalized.startsWith("+") ? normalized.slice(1) : normalized;
      const form = new URLSearchParams();
      form.set("target", target);
      form.set("message", previewBody);
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
      return {
        ok: true,
        message: `Preview ${type} dikirim ke ${normalized}.`,
        detail: previewBody,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Error" };
    }
  }
  return { ok: false, message: `OTP_MODE='${mode}' belum didukung untuk preview.` };
}

export async function testWaAction(to: string): Promise<TestActionState> {
  await requireAdmin();
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false, message: "Format nomor HP tidak valid." };
  }
  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  const message =
    "Halo! Ini pesan test dari Kos Baiti. Jika Anda menerima ini, integrasi gateway WA Anda berfungsi.";

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
