import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Endpoint khusus mode mock gateway:
 * GET /api/webhooks/payment/mock?ext=...&order=...&amount=...
 *
 * Ditampilkan sebagai "halaman pembayaran" simulasi. Saat user buka URL
 * ini, kita langsung tandai transaksi PAID & redirect ke /payments.
 *
 * Hanya berfungsi jika PAYMENT_GATEWAY=mock.
 */
export async function GET(req: Request) {
  if ((process.env.PAYMENT_GATEWAY ?? "mock") !== "mock") {
    return NextResponse.json(
      { error: "mock endpoint disabled" },
      { status: 404 }
    );
  }
  const url = new URL(req.url);
  const ext = url.searchParams.get("ext") ?? "";
  if (!ext) {
    return NextResponse.json({ error: "missing ext" }, { status: 400 });
  }
  const tx = await prisma.gatewayTransaction.findFirst({
    where: { externalId: ext },
    include: {
      payment: { include: { tenancy: { include: { room: { include: { kos: true } } } } } },
    },
  });
  if (!tx) return NextResponse.json({ error: "tx not found" }, { status: 404 });

  if (tx.status !== "PAID") {
    await prisma.gatewayTransaction.update({
      where: { id: tx.id },
      data: {
        status: "PAID",
        paymentMethod: "mock_qris",
        paidAt: new Date(),
        raw: JSON.stringify({ provider: "MOCK", note: "auto-paid via mock endpoint" }),
      },
    });
    if (tx.payment.status !== "VERIFIED") {
      await prisma.payment.update({
        where: { id: tx.payment.id },
        data: {
          status: "VERIFIED",
          reviewedAt: new Date(),
          reviewNote: "Auto-verified via MOCK gateway",
          proofUrl: tx.payment.proofUrl ?? "/uploads/.gateway-paid",
        },
      });
      await notify({
        userId: tx.payment.tenancy.tenantId,
        type: "PAYMENT_AUTO_VERIFIED",
        title: "Pembayaran berhasil (mock)",
        message: `Periode ${tx.payment.periodMonth}/${tx.payment.periodYear} sudah LUNAS lewat gateway mock.`,
        link: "/payments",
      });
      await notify({
        userId: tx.payment.tenancy.room.kos.ownerId,
        type: "PAYMENT_AUTO_VERIFIED",
        title: "Pembayaran tenant masuk (mock)",
        message: `${tx.payment.tenancy.room.kos.name} - Kamar ${tx.payment.tenancy.room.name} sudah dibayar.`,
        link: "/payments",
      });
    }
  }

  const back = `${url.origin}/payments`;
  // HTML mini-page agar user lihat konfirmasi sebentar lalu balik.
  return new Response(
    `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Pembayaran berhasil</title>
<meta http-equiv="refresh" content="2;url=${back}">
<style>
body{font-family:system-ui,sans-serif;background:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:12px;padding:32px;max-width:380px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.08)}
h1{color:#10b981;margin:0 0 8px}
p{color:#475569;margin:8px 0 0;font-size:14px}
a{color:#2563eb;text-decoration:none}
</style></head><body>
<div class="card">
<h1>✓ Pembayaran berhasil</h1>
<p>Mode <b>mock</b> — transaksi langsung di-verify.<br>
Anda akan diarahkan kembali ke aplikasi…</p>
<p><a href="${back}">Klik di sini bila tidak otomatis</a></p>
</div>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
