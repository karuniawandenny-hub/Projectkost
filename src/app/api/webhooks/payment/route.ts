import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMidtransSignature } from "@/lib/gateway";
import { notify } from "@/lib/notify";
import { sendPaymentVerifiedConfirmation } from "@/lib/payment-confirmation";

export const dynamic = "force-dynamic";

/**
 * Webhook callback dari Midtrans:
 * POST /api/webhooks/payment
 * Body: { order_id, transaction_status, gross_amount, signature_key, ... }
 *
 * Verifikasi signature, lalu update Payment + GatewayTransaction status.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const orderId = String(body.order_id ?? "");
  const txStatus = String(body.transaction_status ?? "");
  const statusCode = String(body.status_code ?? "200");
  const grossAmount = String(body.gross_amount ?? "");
  const signatureKey = String(body.signature_key ?? "");

  if (!orderId) {
    return NextResponse.json({ error: "missing order_id" }, { status: 400 });
  }

  // Verifikasi Midtrans signature kecuali mode mock.
  if (process.env.PAYMENT_GATEWAY === "midtrans") {
    const ok = verifyMidtransSignature(orderId, statusCode, grossAmount, signatureKey);
    if (!ok) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  // Cari GatewayTransaction.
  const tx = await prisma.gatewayTransaction.findFirst({
    where: { externalId: orderId },
    include: {
      payment: { include: { tenancy: { include: { room: { include: { kos: true } } } } } },
    },
  });
  if (!tx) {
    return NextResponse.json({ error: "tx not found" }, { status: 404 });
  }

  // Map Midtrans transaction_status ke status internal.
  let internalStatus: "PENDING" | "PAID" | "EXPIRED" | "FAILED" = "PENDING";
  if (txStatus === "capture" || txStatus === "settlement") internalStatus = "PAID";
  else if (txStatus === "deny" || txStatus === "cancel" || txStatus === "failure")
    internalStatus = "FAILED";
  else if (txStatus === "expire") internalStatus = "EXPIRED";

  await prisma.gatewayTransaction.update({
    where: { id: tx.id },
    data: {
      status: internalStatus,
      paymentMethod: String(body.payment_type ?? "") || null,
      raw: JSON.stringify(body),
      paidAt: internalStatus === "PAID" ? new Date() : null,
    },
  });

  if (internalStatus === "PAID" && tx.payment.status !== "VERIFIED") {
    await prisma.payment.update({
      where: { id: tx.payment.id },
      data: {
        status: "VERIFIED",
        reviewedAt: new Date(),
        reviewNote: `Auto-verified via ${tx.provider} (${body.payment_type ?? "-"})`,
        // proofUrl di-isi placeholder agar UI tidak crash kalau nggak ada
        proofUrl: tx.payment.proofUrl ?? "/uploads/.gateway-paid",
      },
    });
    // Notif ke penghuni.
    await notify({
      userId: tx.payment.tenancy.tenantId,
      type: "PAYMENT_AUTO_VERIFIED",
      title: "Pembayaran berhasil & otomatis lunas",
      message: `Pembayaran via ${body.payment_type ?? "gateway"} terkonfirmasi. Periode ${tx.payment.periodMonth}/${tx.payment.periodYear} sekarang LUNAS.`,
      link: "/payments",
    });
    // Notif ke pemilik.
    const ownerId = tx.payment.tenancy.room.kos.ownerId;
    await notify({
      userId: ownerId,
      type: "PAYMENT_AUTO_VERIFIED",
      title: "Pembayaran tenant masuk via gateway",
      message: `${tx.payment.tenancy.room.kos.name} - Kamar ${tx.payment.tenancy.room.name} sudah dibayar lewat ${body.payment_type ?? "gateway"}.`,
      link: "/payments",
    });

    try {
      await sendPaymentVerifiedConfirmation(tx.payment.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[payment-confirmation] gagal kirim WA/Email:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
