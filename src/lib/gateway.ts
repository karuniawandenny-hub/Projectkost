/**
 * Payment gateway abstraction.
 *
 * Mode (env PAYMENT_GATEWAY):
 *   "mock"     (default): generate URL dummy yang langsung trigger webhook
 *                         lokal — bagus untuk demo & testing tanpa kunci.
 *   "midtrans"          : pakai Midtrans Snap. Set:
 *                         MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY,
 *                         MIDTRANS_PROD ("0"|"1").
 *
 * Webhook callback diarahkan ke /api/webhooks/payment. Verifikasi
 * signature dilakukan sesuai provider.
 */

import crypto from "crypto";

export type GatewayResult = {
  externalId: string;
  redirectUrl: string;
  raw?: unknown;
};

export type CreatePayload = {
  orderId: string;       // unique kita
  amount: number;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  itemDescription: string;
  appOrigin: string;     // mis. https://kos.example.com
};

export function gatewayProvider(): string {
  return (process.env.PAYMENT_GATEWAY ?? "mock").toLowerCase();
}

export async function createTransaction(
  data: CreatePayload
): Promise<GatewayResult> {
  const provider = gatewayProvider();
  if (provider === "midtrans") return createMidtrans(data);
  return createMock(data);
}

/* =====================================================================
 *  MOCK
 * ===================================================================== */
function createMock(data: CreatePayload): GatewayResult {
  const externalId = `mock-${data.orderId}-${Date.now()}`;
  // URL yang ditampilkan ke user: nge-redirect ke endpoint mock yang
  // langsung POST ke webhook + redirect kembali ke aplikasi.
  const url = `${data.appOrigin}/api/webhooks/payment/mock?ext=${encodeURIComponent(
    externalId
  )}&order=${encodeURIComponent(data.orderId)}&amount=${data.amount}`;
  return { externalId, redirectUrl: url };
}

/* =====================================================================
 *  MIDTRANS (Snap)
 *  Docs: https://docs.midtrans.com/reference/getting-started-snap-api
 * ===================================================================== */
async function createMidtrans(data: CreatePayload): Promise<GatewayResult> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diset");
  const isProd = process.env.MIDTRANS_PROD === "1";
  const url = isProd
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";

  const auth = Buffer.from(`${serverKey}:`).toString("base64");

  const body = {
    transaction_details: {
      order_id: data.orderId,
      gross_amount: data.amount,
    },
    customer_details: {
      first_name: data.customerName,
      email: data.customerEmail,
      phone: data.customerPhone,
    },
    item_details: [
      {
        id: data.orderId,
        name: data.itemDescription.slice(0, 50),
        price: data.amount,
        quantity: 1,
      },
    ],
    callbacks: {
      finish: `${data.appOrigin}/payments`,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });
  const json: { token?: string; redirect_url?: string; error_messages?: string[] } =
    await res.json();
  if (!res.ok || !json.redirect_url) {
    throw new Error(
      `Midtrans error: ${json.error_messages?.join("; ") ?? res.status}`
    );
  }
  return {
    externalId: data.orderId,
    redirectUrl: json.redirect_url,
    raw: json,
  };
}

/* =====================================================================
 *  Verifikasi webhook signature (Midtrans).
 * ===================================================================== */
export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string
): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  const expected = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
  return expected === signatureKey;
}
