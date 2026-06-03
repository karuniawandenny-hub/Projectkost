/**
 * Konfirmasi pembayaran lunas: kirim WA + Email ke penghuni saat
 * Payment berubah status menjadi VERIFIED (baik manual oleh owner
 * maupun otomatis dari gateway).
 *
 * Idempotency: pakai ReminderLog dengan type "CONFIRM" (channel "WA"
 * dan "EMAIL"). Unique constraint (paymentId, type, channel) mencegah
 * pengiriman ganda kalau handler dipanggil lebih dari sekali (mis.
 * retry webhook atau owner re-verify).
 *
 * Catatan reminder berikutnya: tidak perlu dimatikan eksplisit —
 * processReminders() di lib/reminders.ts hanya scan Payment dengan
 * status DUE/PENDING, jadi tagihan VERIFIED otomatis tidak masuk
 * kandidat reminder lagi.
 */

import { prisma } from "./prisma";
import { sendEmailGeneric } from "./reminders";
import { sendWAWithTemplate } from "./wa-templates";

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatDateTimeID(d: Date): string {
  const date = d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date}, ${time}`;
}

function buildConfirmationMessage(input: {
  tenantName: string;
  kosName: string;
  roomName: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  verifiedAt: Date;
}): { subject: string; body: string } {
  const periodLabel = `${MONTH_LABELS[input.periodMonth - 1]} ${input.periodYear}`;
  const amountFmt = "Rp " + input.amount.toLocaleString("id-ID");
  const subject = `Pembayaran ${periodLabel} sudah lunas`;
  const body = `Halo ${input.tenantName},

Terima kasih, pembayaran Anda sudah kami verifikasi:
  Kos     : ${input.kosName}
  Kamar   : ${input.roomName}
  Periode : ${periodLabel}
  Nominal : ${amountFmt}
  Diverifikasi: ${formatDateTimeID(input.verifiedAt)}

Tagihan untuk periode ini sudah lunas. Sampai jumpa di periode berikutnya!

— Kos Baiti`;
  return { subject, body };
}

export type ConfirmationResult = {
  paymentId: string;
  waSent: boolean;
  emailSent: boolean;
  skipped: { channel: "WA" | "EMAIL"; reason: string }[];
  errors: { channel: "WA" | "EMAIL"; error: string }[];
};

/**
 * Kirim WA + Email konfirmasi pembayaran lunas. Aman dipanggil
 * berkali-kali — idempotent per channel via ReminderLog.
 */
export async function sendPaymentVerifiedConfirmation(
  paymentId: string
): Promise<ConfirmationResult> {
  const out: ConfirmationResult = {
    paymentId,
    waSent: false,
    emailSent: false,
    skipped: [],
    errors: [],
  };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      tenancy: {
        include: {
          tenant: { select: { id: true, name: true, email: true, phone: true } },
          room: { include: { kos: { select: { name: true } } } },
        },
      },
      reminders: {
        where: { type: "CONFIRM" },
        select: { channel: true },
      },
    },
  });
  if (!payment) {
    out.errors.push({ channel: "WA", error: "Payment tidak ditemukan." });
    return out;
  }
  if (payment.status !== "VERIFIED") {
    out.skipped.push({ channel: "WA", reason: `status=${payment.status}, bukan VERIFIED` });
    return out;
  }

  const tenant = payment.tenancy.tenant;
  const sentChannels = new Set(payment.reminders.map((r) => r.channel));
  const { subject, body } = buildConfirmationMessage({
    tenantName: tenant.name,
    kosName: payment.tenancy.room.kos.name,
    roomName: payment.tenancy.room.name,
    periodMonth: payment.periodMonth,
    periodYear: payment.periodYear,
    amount: payment.amount,
    verifiedAt: payment.reviewedAt ?? new Date(),
  });

  // WhatsApp
  if (sentChannels.has("WA")) {
    out.skipped.push({ channel: "WA", reason: "sudah pernah dikirim" });
  } else if (!tenant.phone) {
    out.skipped.push({ channel: "WA", reason: "tenant tidak punya nomor HP" });
  } else {
    try {
      await sendWAWithTemplate({
        phone: tenant.phone,
        text: body,
        template: {
          name: "payment_verified",
          params: [
            tenant.name,
            `${MONTH_NAMES_ID[payment.periodMonth - 1]} ${payment.periodYear}`,
            "Rp " + payment.amount.toLocaleString("id-ID"),
            (payment.reviewedAt ?? new Date()).toLocaleString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          ],
        },
      });
      await prisma.reminderLog.create({
        data: { paymentId, type: "CONFIRM", channel: "WA" },
      });
      out.waSent = true;
    } catch (e) {
      out.errors.push({
        channel: "WA",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Email
  if (sentChannels.has("EMAIL")) {
    out.skipped.push({ channel: "EMAIL", reason: "sudah pernah dikirim" });
  } else if (!tenant.email) {
    out.skipped.push({ channel: "EMAIL", reason: "tenant tidak punya email" });
  } else {
    try {
      await sendEmailGeneric(tenant.email, subject, body);
      await prisma.reminderLog.create({
        data: { paymentId, type: "CONFIRM", channel: "EMAIL" },
      });
      out.emailSent = true;
    } catch (e) {
      out.errors.push({
        channel: "EMAIL",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return out;
}
