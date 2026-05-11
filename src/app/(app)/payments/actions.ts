"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { notify } from "@/lib/notify";

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
  if (existing) {
    await prisma.payment.update({
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
  } else {
    await prisma.payment.create({
      data: {
        tenancyId: tenancy.id,
        periodMonth: month,
        periodYear: year,
        amount,
        proofUrl,
        note,
      },
    });
  }

  await notify({
    userId: tenancy.room.kos.ownerId,
    type: "PAYMENT_SUBMITTED",
    title: "Bukti pembayaran baru",
    message: `${user.name} mengupload bukti pembayaran untuk kamar ${tenancy.room.name}.`,
    link: "/payments",
  });

  revalidatePath("/payments");
  redirect("/payments");
}

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

  revalidatePath("/payments");
}
