"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { notify } from "@/lib/notify";
import { sendPaymentVerifiedConfirmation } from "@/lib/payment-confirmation";
import { logAudit } from "@/lib/audit";

export type PaymentSubmitState = { error?: string };

export async function submitPayment(
  _prev: PaymentSubmitState,
  formData: FormData
): Promise<PaymentSubmitState> {
  const user = await requireUser();
  if (user.role !== "TENANT") return { error: "Hanya penghuni yang bisa upload pembayaran." };

  const tenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, status: "ACTIVE" },
    include: { room: { include: { kos: { include: { owner: true } } } } },
  });
  if (!tenancy) {
    return { error: "Anda belum di-assign ke kamar manapun. Hubungi pemilik kos." };
  }

  const month = parseInt(String(formData.get("month") ?? ""), 10);
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const amountRaw = String(formData.get("amount") ?? "");
  const amount = parseInt(amountRaw.replace(/\D/g, ""), 10);
  const note = String(formData.get("note") ?? "").trim() || null;
  const proof = formData.get("proof");

  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { error: "Bulan tidak valid." };
  }
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { error: "Tahun tidak valid." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Nominal pembayaran tidak valid." };
  }
  if (!(proof instanceof File) || proof.size === 0) {
    return { error: "Bukti pembayaran wajib diunggah." };
  }

  // Cegah duplikasi pembayaran untuk periode yang sudah VERIFIED.
  const existing = await prisma.payment.findFirst({
    where: { tenancyId: tenancy.id, periodMonth: month, periodYear: year },
  });
  if (existing && existing.status === "VERIFIED") {
    return { error: "Pembayaran untuk periode ini sudah lunas." };
  }

  let proofUrl: string;
  try {
    proofUrl = await saveUploadedFile(proof, `payments/${tenancy.id}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal unggah bukti." };
  }

  // Jika pembayaran sebelumnya REJECTED/PENDING untuk periode sama -> update.
  let paymentId: string;
  if (existing) {
    const updated = await prisma.payment.update({
      where: { id: existing.id },
      data: {
        amount,
        proofUrl,
        note,
        status: "PENDING",
        reviewedAt: null,
        reviewNote: null,
      },
    });
    paymentId = updated.id;
  } else {
    // CRITICAL: set status="PENDING" eksplisit. Default schema = "DUE"
    // → kalau tidak diset, payment baru muncul dengan badge "Tagihan
    // dibuat" walau proofUrl sudah ada. Bug yang user laporkan.
    const created = await prisma.payment.create({
      data: {
        tenancyId: tenancy.id,
        periodMonth: month,
        periodYear: year,
        amount,
        proofUrl,
        note,
        status: "PENDING",
      },
    });
    paymentId = created.id;
  }

  // Notif ke pemilik kos: ada bukti baru untuk diverifikasi.
  await notify({
    userId: tenancy.room.kos.ownerId,
    type: "PAYMENT_SUBMITTED",
    title: "Bukti pembayaran baru",
    message: `${user.name} mengupload bukti pembayaran untuk kamar ${tenancy.room.name}.`,
    link: "/payments",
  });

  // Notif ke penghuni sendiri: konfirmasi bukti sudah diterima sistem
  // & sedang menunggu verifikasi pemilik. Muncul di lonceng notifikasi.
  await notify({
    userId: user.id,
    type: "PAYMENT_SUBMITTED_SELF",
    title: "Bukti pembayaran terkirim",
    message: `Bukti pembayaran ${MONTHS_ID[month - 1]} ${year} sudah diterima. Pembayaran Anda dalam proses verifikasi oleh pemilik kos.`,
    link: "/payments",
  });

  revalidatePath("/payments");
  // Query param dipakai halaman /payments untuk menampilkan banner sukses
  // yang langsung kelihatan di mata user (lebih cepat ditangkap daripada
  // notifikasi bell).
  redirect(`/payments?uploaded=${paymentId}`);
}

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export async function verifyPayment(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("FORBIDDEN");

  const paymentId = String(formData.get("paymentId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenancy: { room: { kos: { ownerId: user.id } } } },
    include: { tenancy: { include: { tenant: true, room: true } } },
  });
  if (!payment) throw new Error("NOT_FOUND");

  if (action !== "VERIFY" && action !== "REJECT") return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: action === "VERIFY" ? "VERIFIED" : "REJECTED",
      reviewedAt: new Date(),
      reviewNote,
    },
  });

  await logAudit({
    actorId: user.id,
    actorName: user.name,
    action: action === "VERIFY" ? "PAYMENT.VERIFY" : "PAYMENT.REJECT",
    entityType: "Payment",
    entityId: payment.id,
    metadata: {
      tenantName: payment.tenancy.tenant.name,
      roomName: payment.tenancy.room.name,
      period: `${payment.periodMonth}/${payment.periodYear}`,
      amount: payment.amount,
      reviewNote,
    },
  });

  await notify({
    userId: payment.tenancy.tenantId,
    type: action === "VERIFY" ? "PAYMENT_VERIFIED" : "PAYMENT_REJECTED",
    title:
      action === "VERIFY"
        ? "Pembayaran Anda lunas"
        : "Pembayaran Anda ditolak",
    message:
      action === "VERIFY"
        ? `Pembayaran kamar ${payment.tenancy.room.name} sudah diverifikasi.`
        : `Pembayaran Anda ditolak${reviewNote ? `: ${reviewNote}` : "."}`,
    link: "/payments",
  });

  if (action === "VERIFY") {
    try {
      await sendPaymentVerifiedConfirmation(payment.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[payment-confirmation] gagal kirim WA/Email:", e);
    }
  }

  revalidatePath("/payments");
}
