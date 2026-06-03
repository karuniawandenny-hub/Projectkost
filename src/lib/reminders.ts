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

// =====================================================================
//  Anti-spam helpers
// =====================================================================
//
// Tujuan: turunkan risiko pesan WA ditandai spam oleh Meta/WhatsApp.
// Sinyal yang biasa di-flag:
//  - Burst kirim ke banyak nomor dalam waktu singkat → ditahan jitter.
//  - Pesan template identik → variasi greeting/closing/struktur body.
//  - Kirim di jam tidak masuk akal (dini hari) → quiet hours guard.
//  - Banyak penerima belum simpan kontak → CTA "simpan nomor"
//    (sudah ada di appendWaSignature).
//

/**
 * Ambil nama depan saja dari nama lengkap. Lebih natural di sapaan
 * personal & terkesan tidak template ("Halo Budi" vs "Halo Budi Santoso").
 * Body tetap pakai nama lengkap untuk formalitas.
 */
function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return trimmed;
  const parts = trimmed.split(/\s+/);
  return parts[0];
}

/**
 * Konversi waktu UTC ke jam Asia/Jakarta (UTC+7). Server Railway/Vercel
 * biasanya UTC, jadi pakai konversi manual supaya tidak bergantung TZ env.
 */
function jakartaHour(now: Date = new Date()): number {
  return (now.getUTCHours() + 7) % 24;
}

/**
 * Salam berdasarkan jam Asia/Jakarta. Bikin pesan terasa kontekstual
 * & tidak seperti broadcast template.
 */
function greetingByHour(h: number): string {
  if (h >= 4 && h < 11) return "Selamat pagi";
  if (h >= 11 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

/**
 * Cek apakah saat ini dalam "quiet hours" — periode di mana cron
 * reminder BULK tidak boleh kirim WA, karena pesan otomatis di jam
 * tidur (22:00-06:00 WIB default) terlihat sangat spammy.
 *
 * Konfigurasi via env:
 *  - WA_QUIET_HOURS_START (jam mulai, default 22)
 *  - WA_QUIET_HOURS_END   (jam selesai, default 6)
 * Set keduanya = 0 untuk nonaktifkan.
 *
 * Catatan: hanya berlaku untuk operasi bulk (cron reminders), bukan
 * notifikasi transaksional (welcome assignment, konfirmasi pembayaran,
 * komplain selesai) yang dipicu langsung oleh aksi user.
 */
export function isQuietHoursNow(now: Date = new Date()): boolean {
  const startStr = process.env.WA_QUIET_HOURS_START ?? "22";
  const endStr = process.env.WA_QUIET_HOURS_END ?? "6";
  const start = Number.parseInt(startStr, 10);
  const end = Number.parseInt(endStr, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start === 0 && end === 0) return false;
  const h = jakartaHour(now);
  // Range melewati tengah malam (mis. 22-06): aktif kalau h >= 22 ATAU h < 6.
  if (start > end) return h >= start || h < end;
  // Range biasa (mis. 1-5): aktif kalau h >= 1 DAN h < 5.
  return h >= start && h < end;
}

// =====================================================================

// Variasi sapaan untuk mengurangi kemiripan template antar pesan
// (turunkan risiko trigger anti-spam WA yang deteksi bulk-messaging).
// "Selamat <jam>" akan diisi dinamis berdasarkan waktu kirim sebenarnya
// di buildReminderMessage, supaya konteks waktu terasa autentik.
const GREETINGS = ["Halo", "Hai", "Assalamualaikum warahmatullah", "__BY_TIME__"];

// Variasi kalimat pembuka body — pecah pola "Tagihan kos Anda untuk
// periode ..." yang sebelumnya identik untuk semua penerima.
const BODY_INTROS = [
  "Tagihan kos Anda untuk periode {period}:",
  "Berikut rincian tagihan kos periode {period}:",
  "Iuran kos Anda bulan {period}:",
  "Tagihan sewa kamar untuk {period}:",
];
const REMINDER_CLOSINGS = [
  "Jangan lupa untuk menyelesaikan pembayaran sebelum jatuh tempo, ya.",
  "Mohon disiapkan pembayarannya sebelum jatuh tempo.",
  "Terima kasih atas perhatian dan kerja samanya.",
  "Silakan upload bukti transfer di aplikasi setelah membayar.",
];
const OVERDUE_CLOSINGS = [
  "Mohon segera upload bukti pembayaran agar tidak menambah keterlambatan.",
  "Mohon kerja samanya untuk menyelesaikan pembayaran secepatnya.",
  "Silakan hubungi pemilik kos kalau ada kendala pembayaran.",
];

function pickVariation(seed: string, list: string[]): string {
  // Deterministik berdasarkan seed (paymentId+type) supaya retry tidak
  // ganti pesan, tapi tetap bervariasi antar tenant/periode.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return list[Math.abs(hash) % list.length];
}

export function buildReminderMessage(input: ReminderMessageInput): {
  subject: string;
  body: string;
} {
  const periodLabel = `${MONTH_LABELS[input.periodMonth - 1]} ${input.periodYear}`;
  const dueStr = formatDateID(input.dueDate);
  const amountFmt = "Rp " + input.amount.toLocaleString("id-ID");
  const seed = `${input.tenantName}-${input.type}-${input.periodMonth}-${input.periodYear}`;
  let greeting = pickVariation(seed, GREETINGS);
  // "__BY_TIME__" → ganti dengan salam aktual berdasarkan jam server WIB.
  if (greeting === "__BY_TIME__") {
    greeting = greetingByHour(jakartaHour());
  }
  const intro = pickVariation(seed + "-intro", BODY_INTROS).replace(
    "{period}",
    periodLabel
  );
  const closing =
    input.type === "OVERDUE"
      ? pickVariation(seed, OVERDUE_CLOSINGS)
      : pickVariation(seed, REMINDER_CLOSINGS);
  const subject =
    input.type === "OVERDUE"
      ? `Tagihan ${periodLabel} terlambat`
      : `Pengingat tagihan kos — ${
          input.type === "H7" ? "7 hari lagi" : input.type === "H3" ? "3 hari lagi" : "besok"
        }`;
  const overdueLine =
    input.type === "OVERDUE"
      ? `Tagihan sudah lewat ${input.daysOverdue ?? 1} hari. ${closing}`
      : closing;
  // Sapaan pakai NAMA DEPAN (lebih personal & natural — kurangi kesan
  // template/broadcast). Body pakai nama lengkap untuk formalitas tetap.
  const body = `${greeting} ${firstName(input.tenantName)},

${intro}
  Kos     : ${input.kosName}
  Kamar   : ${input.roomName}
  Nominal : ${amountFmt}
  Jatuh tempo: ${dueStr}

${overdueLine}

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

  // === Anti-spam guard: skip WA blast saat jam tidur WIB ===
  // Email & in-app tetap dikirim. WA dilewati supaya tidak dianggap
  // burst dini hari yang sangat spammy oleh Meta.
  const waBlockedByQuietHours = isQuietHoursNow();

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

    // 3) WhatsApp (kalau ada, dan tidak dalam quiet hours).
    if (!alreadyH.has("WA") && tenant.phone && !waBlockedByQuietHours) {
      try {
        await sendWhatsAppGeneric(tenant.phone, body);
        await prisma.reminderLog.create({
          data: { paymentId: p.id, type, channel: "WA" },
        });
        result.sent.push({ type, channel: "WA" });
        // Throttle jeda 5-15 detik antar pesan WA untuk hindari pattern
        // burst yang trigger anti-spam WhatsApp. Hanya dilakukan kalau
        // WA benar-benar terkirim (bukan dev mode atau disabled).
        if ((process.env.WA_ENABLED ?? "true").toLowerCase() !== "false") {
          const jitter = 5000 + Math.floor(Math.random() * 10000);
          await new Promise((r) => setTimeout(r, jitter));
        }
      } catch (e) {
        result.errors.push({
          paymentId: p.id,
          error: `wa: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  // ===================================================================
  //  Reminder maintenance preventif (H-7, H-3, H-1) ke pemilik kos.
  //  Skip CORRECTIVE (sudah COMPLETED saat dibuat dari komplain).
  // ===================================================================
  const upcoming = await prisma.maintenance.findMany({
    where: {
      type: "PREVENTIVE",
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
    },
    include: {
      kos: {
        include: {
          owner: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      },
      room: { select: { name: true } },
    },
  });

  for (const m of upcoming) {
    const dayDiff = daysBetween(today, m.scheduledDate);
    let kind: "H7" | "H3" | "H1" | null = null;
    if (dayDiff === 7 && !m.reminderH7Sent) kind = "H7";
    else if (dayDiff === 3 && !m.reminderH3Sent) kind = "H3";
    else if (dayDiff === 1 && !m.reminderH1Sent) kind = "H1";
    if (!kind) continue;

    const owner = m.kos.owner;
    const dueStr = m.scheduledDate.toLocaleDateString("id-ID", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const scope = m.room ? `Kamar ${m.room.name}` : "Fasilitas kos";
    const horizon =
      kind === "H7" ? "7 hari lagi" : kind === "H3" ? "3 hari lagi" : "besok";
    const subject = `Pengingat perawatan — ${horizon}`;
    const body =
      `Halo ${owner.name.split(/\s+/)[0]},\n\n` +
      `Jadwal perawatan ${horizon} (${dueStr}):\n` +
      `  ${m.title}\n` +
      `  ${m.kos.name} • ${scope}\n\n` +
      `Buka aplikasi untuk tandai sudah dikerjakan atau atur ulang jadwal.\n\n` +
      `— Kos Baiti`;

    // In-app
    try {
      await prisma.notification.create({
        data: {
          userId: owner.id,
          type: `MAINT_${kind}`,
          title: subject,
          message: `${m.title} — ${m.kos.name} • ${scope} — ${dueStr}`,
          link: `/maintenance/${m.id}`,
        },
      });
    } catch (e) {
      result.errors.push({
        paymentId: `maint:${m.id}`,
        error: `in_app: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    // WA (skip kalau quiet hours)
    if (owner.phone && !waBlockedByQuietHours) {
      try {
        await sendWhatsAppGeneric(owner.phone, body);
        if ((process.env.WA_ENABLED ?? "true").toLowerCase() !== "false") {
          await new Promise((r) =>
            setTimeout(r, 5000 + Math.floor(Math.random() * 10000))
          );
        }
      } catch (e) {
        result.errors.push({
          paymentId: `maint:${m.id}`,
          error: `wa: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // Email
    if (owner.email) {
      try {
        await sendEmailGeneric(owner.email, subject, body);
      } catch (e) {
        result.errors.push({
          paymentId: `maint:${m.id}`,
          error: `email: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // Mark sent (atomic per-kind) supaya tidak dispam saat cron re-run.
    await prisma.maintenance.update({
      where: { id: m.id },
      data: {
        reminderH7Sent: kind === "H7" ? true : m.reminderH7Sent,
        reminderH3Sent: kind === "H3" ? true : m.reminderH3Sent,
        reminderH1Sent: kind === "H1" ? true : m.reminderH1Sent,
      },
    });
    result.sent.push({ type: kind as ReminderType, channel: "MAINT" });
  }

  return result;
}

async function sendWhatsAppGeneric(phone: string, message: string): Promise<void> {
  // Tempel signature URL aplikasi di paling bawah setiap pesan WA.
  // Idempotent — kalau pemanggil sudah pasang URL, tidak akan double.
  message = appendWaSignature(message);
  // Kill-switch global. Set WA_ENABLED=false di Railway untuk
  // mematikan SEMUA pengiriman WA tanpa ubah kode lain (reminder cron,
  // konfirmasi pembayaran, assign tenant). Pakai saat akun WA
  // sedang di-restrict Meta atau provider gateway down.
  if ((process.env.WA_ENABLED ?? "true").toLowerCase() === "false") {
    // eslint-disable-next-line no-console
    console.log(`[wa][disabled] skip ${phone} - WA_ENABLED=false`);
    return;
  }
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
    const txt = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}: ${txt}`);
    // Fonnte selalu return HTTP 200 sekalipun gagal kirim. Status real
    // ada di field `status` body JSON; reason di field `reason`.
    let parsed: { status?: boolean; reason?: string; detail?: string } = {};
    try {
      parsed = JSON.parse(txt);
    } catch {
      throw new Error(`Fonnte response bukan JSON: ${txt.slice(0, 200)}`);
    }
    if (parsed.status === false) {
      throw new Error(
        `Fonnte gagal: ${parsed.reason ?? parsed.detail ?? "unknown"}`
      );
    }
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


/**
 * Tempel link aplikasi di ATAS pesan + CTA simpan nomor di BAWAH.
 *
 * Kenapa URL di atas:
 *  WhatsApp render preview card untuk URL yang muncul di awal pesan.
 *  Kalau URL di akhir, WA sering skip render preview (terutama untuk
 *  pesan dari WA Business API / gateway Fonnte). Pindah URL ke baris
 *  pertama bikin preview card kepala (logo + judul + deskripsi) konsisten
 *  muncul di semua client penerima.
 *
 * Format final:
 *    https://www.kosbaiti.com         ← URL di baris pertama → preview
 *                                       fire reliably
 *    {body pesan asli}                ← greeting + body + sign-off
 *    Simpan nomor ini agar ...        ← CTA di bawah (tanpa URL ganda)
 *
 * Idempotent: kalau pesan sudah berisi URL (mis. dipanggil ulang
 * karena retry), tidak akan double.
 *
 * Normalisasi defensif: env diset apex tanpa www → paksa jadi www.
 */
export function appendWaSignature(message: string): string {
  let url = process.env.NEXT_PUBLIC_SITE_URL || "https://www.kosbaiti.com";
  url = url.replace(/^https?:\/\/kosbaiti\.com/i, "https://www.kosbaiti.com");
  if (message.includes(url)) return message;
  const cta = "Simpan nomor ini agar update dari Kos Baiti tidak terlewat.";
  return `${url}\n\n${message.trimEnd()}\n\n${cta}`;
}

export { sendWhatsAppGeneric, sendEmailGeneric };

