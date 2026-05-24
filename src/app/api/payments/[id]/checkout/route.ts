import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createTransaction, gatewayProvider } from "@/lib/gateway";
import { publicOrigin } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/[id]/checkout
 *
 * Penghuni meminta link bayar untuk Payment tertentu. Membuat
 * GatewayTransaction baru dan return redirectUrl.
 *
 * NOTE: Pembayaran online dinonaktifkan untuk sementara per permintaan
 * owner. Hanya fitur upload bukti yang aktif. Untuk re-enable: set env
 * `ONLINE_PAYMENT_ENABLED=true` di Railway Variables + restart.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (process.env.ONLINE_PAYMENT_ENABLED !== "true") {
    return NextResponse.json(
      {
        error:
          "Pembayaran online sementara dinonaktifkan. Silakan upload bukti transfer manual via tombol \"Upload bukti\".",
      },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: { tenancy: { include: { tenant: true, room: { include: { kos: true } } } } },
  });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.tenancy.tenantId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (payment.status === "VERIFIED") {
    return NextResponse.json({ error: "Sudah lunas" }, { status: 400 });
  }

  const origin = publicOrigin(req);
  const orderId = `kk-${payment.id}-${Date.now()}`;

  try {
    const tx = await createTransaction({
      orderId,
      amount: payment.amount,
      customerName: payment.tenancy.tenant.name,
      customerEmail: payment.tenancy.tenant.email,
      customerPhone: payment.tenancy.tenant.phone ?? undefined,
      itemDescription: `Sewa ${payment.tenancy.room.kos.name} kamar ${payment.tenancy.room.name}`,
      appOrigin: origin,
    });
    await prisma.gatewayTransaction.create({
      data: {
        paymentId: payment.id,
        provider: gatewayProvider().toUpperCase(),
        externalId: tx.externalId,
        amount: payment.amount,
        status: "PENDING",
        raw: tx.raw ? JSON.stringify(tx.raw) : null,
      },
    });
    return NextResponse.json({ ok: true, redirectUrl: tx.redirectUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gateway error" },
      { status: 500 }
    );
  }
}
