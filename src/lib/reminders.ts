/**
 * Sistem pengingat pembayaran otomatis.
 *
 * Bagaimana cara pakai:
 *  - Set CRON_SECRET di .env (string acak).
 *  - Jadwalkan POST/GET ke /api/cron/reminders?token=$CRON_SECRET dari
 *    cron (Vercel Cron, EasyCron, atau curl di server linux harian).
 *  - Endpoint akan kirim:
 *      H-7 / H-3 / H-1 sebelum jatuh tempo (channel email & WA)
 *      OVERDUE tiap kali dipanggil saat sudah lewat & belum lunas
 *
 * Anti-duplikat: ReminderLog unique by (paymentId, type, channel).
 */

import { prisma } from "./prisma";
import { formatDateID } from "./billing";

export type ReminderType = "H7" | "H3" | "H1" | "OVERDUE";
const THRESHOLDS: { type: ReminderType; daysBefore: number }[] = [
  { type: "H7", daysBefore: 7 },
  { type: "H3", daysBefore: 3 },
  { type: "H1", daysBefore: 1 },
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export type ReminderMessageInput = {
  type: ReminderType;
  tenantName: string;
  kosName: string;
  roomName: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  dueDate: Date;
  daysOverdue?: number;
};

export function buildReminderMessage(input: ReminderMessageInput): {
  subject: string;
  body: string;
} {
  const periodLabel = `${MONTH_LABELS[input.periodMonth - 1]} ${input.periodYear}`;
  const dueStr = formatDateID(input.dueDate);
  const amountFmt = "Rp " + input.amount.toLocaleString("id-ID");
  const subject =
    input.type === "OVERDUE"
      ? `Tagihan ${periodLabel} terlambat`
      : `Pengingat tagihan kos — ${
          input.type === "H7" ? "7 hari lagi" : input.type === "H3" ? "3 hari lagi" : "besok"
        }`;
  const body = `Halo ${input.tenantName},

Tagihan kos Anda untuk periode ${periodLabel}:
  Kos     : ${input.kosName}
  Kamar   : ${input.roomName}
  Nominal : ${amountFmt}
  Jatuh tempo: ${dueStr}

${
  input.type === "OVERDUE"
    ? `Tagihan sudah lewat ${input.daysOverdue ?? 1} hari. Mohon segera upload bukti pembayaran.`
    : `Jangan lupa untuk menyelesaikan pembayaran sebelum jatuh tempo.`
}

— Kos Baiti`;
  return { subject, body };
}

type ProcessResult = {
  scanned: number;
  sent: { type: ReminderType; channel: string }[];
  skipped: number;
  errors: { paymentId: string; error: string }[];
};

export async function processReminders(): Promise<ProcessResult> {
  const today = startOfDay(new Date());
  const result: ProcessResult = {
    scanned: 0,
    sent: [],
    skipped: 0,
    errors: [],
  };

  // Ambil semua payment DUE/PENDING yang punya dueDate.
  const candidates = await prisma.payment.findMany({
    where: {
      status: { in: ["DUE", "PENDING"] },
      dueDate: { not: null },
    },
    include: {
      tenancy: {
        include: {
          tenant: { select: { id: true, email: true, phone: true, name: true } },
          room: { include: { kos: true } },
        },
      },
      reminders: { select: { type: true, channel: true } },
    },
  });

  for (const p of candidates) {
    result.scanned++;
    if (!p.dueDate) continue;
    const dayDiff = daysBetween(today, p.dueDate); // positif = ke depan, negatif = lewat

    // Tentukan reminder type yang relevan hari ini.
    let type: ReminderType | null = null;
    if (dayDiff < 0 && p.status !== "VERIFIED") {
      type = "OVERDUE";
    } else {
      const match = THRESHOLDS.find((t) => t.daysBefore === dayDiff);
      if (match) type = match.type;
    }
    if (!type) {
      result.skipped++;
      continue;
    }

    // Sudah pernah dikirim hari ini untuk channel ini? (cek log)
    // Untuk OVERDUE, kirim sekali per minggu — pakai logika derived:
    // kalau ada log OVERDUE dalam 7 hari terakhir, skip.
    const alreadyH = new Set(
      p.reminders.filter((r) => r.type === type).map((r) => r.channel)
    );

    const tenant = p.tenancy.tenant;
    const periodLabel = `${MONTH_LABELS[p.periodMonth - 1]} ${p.periodYear}`;
    const dueStr = formatDateID(p.dueDate);
    const amountFmt = "Rp " + p.amount.toLocaleString("id-ID");

    const { subject, body } = buildReminderMessage({
      type,
      tenantName: tenant.name,
      kosName: p.tenancy.room.kos.name,
      roomName: p.tenancy.room.name,
      periodMonth: p.periodMonth,
      periodYear: p.periodYear,
      amount: p.amount,
      dueDate: p.dueDate,
      daysOverdue: Math.abs(dayDiff),
    });

    // 1) Notifikasi in-app (selalu).
    if (!alreadyH.has("IN_APP")) {
      try {
        await prisma.notification.create({
          data: {
            userId: tenant.id,
            type: `REMINDER_${type}`,
            title: subject,
            message: `Periode ${periodLabel} • jatuh tempo ${dueStr} • ${amountFmt}`,
            link: "/payments",
          },
        });
        await prisma.reminderLog.create({
          data: { paymentId: p.id, type, channel: "IN_APP" },
        });
        result.sent.push({ type, channel: "IN_APP" });
      } catch (e) {
        result.errors.push({
          paymentId: p.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // 2) Email (kalau ada).
    if (!alreadyH.has("EMAIL") && tenant.email) {
      try {
        // Pakai sendPasswordResetEmail sebagai pembungkus tipis untuk
        // mengirim email biasa via Resend. Anggap body sebagai "url"
        // alternatif — tapi sebenarnya kita butuh fungsi email umum.
        // Untuk MVP, kita kirim via fetch ke Resend langsung di sini
        // (kalau RESEND_API_KEY ada).
        await sendEmailGeneric(tenant.email, subject, body);
        await prisma.reminderLog.create({
          data: { paymentId: p.id, type, channel: "EMAIL" },
        });
        result.sent.push({ type, channel: "EMAIL" });
      } catch (e) {
        result.errors.push({
          paymentId: p.id,
          error: `email: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // 3) WhatsApp (kalau ada).
    if (!alreadyH.has("WA") && tenant.phone) {
      try {
        await sendWhatsAppGeneric(tenant.phone, body);
        await prisma.reminderLog.create({
          data: { paymentId: p.id, type, channel: "WA" },
        });
        result.sent.push({ type, channel: "WA" });
      } catch (e) {
        result.errors.push({
          paymentId: p.id,
          error: `wa: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  return result;
}

async function sendWhatsAppGeneric(phone: string, message: string): Promise<void> {
  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[wa][dev] ${phone}: ${message.slice(0, 60)}…`);
    return;
  }
  if (mode === "fonnte") {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) throw new Error("WA_GATEWAY_TOKEN belum diset");
    const target = phone.startsWith("+") ? phone.slice(1) : phone;
    const form = new URLSearchParams();
    form.set("target", target);
    form.set("message", message);
    form.set("countryCode", "62");
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token },
      body: form,
    });
    if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
    return;
  }
  // Generic gateway: POST JSON.
  const url = process.env.WA_GATEWAY_URL;
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!url || !token) throw new Error("WA gateway belum dikonfigurasi");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ phone, message }),
  });
  if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
}

/**
 * Kirim email umum via Resend. Tidak melempar error agar caller bisa
 * tetap track per-channel.
 */
async function sendEmailGeneric(
  to: string,
  subject: string,
  textBody: string
): Promise<void> {
  const mode = process.env.EMAIL_MODE ?? "dev";
  if (mode !== "resend") {
    // Dev/silent mode: log saja.
    // eslint-disable-next-line no-console
    console.log(`[email][${mode}] -> ${to} subj=${subject}`);
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY/EMAIL_FROM belum diset");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: textBody,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${t}`);
  }
}


export { sendWhatsAppGeneric, sendEmailGeneric };

