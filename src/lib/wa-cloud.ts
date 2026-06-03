/**
 * WhatsApp Business Cloud API client (Meta resmi).
 *
 * Migration target dari Fonnte. Native support untuk:
 *  - Template messages dengan parameterized body + image header
 *    (untuk business-initiated outbound: reminder, welcome, dll)
 *  - Free-form text dengan preview_url=true (hanya di 24h session
 *    setelah user balas — untuk reply ke pertanyaan tenant)
 *  - Media (image/document) attachment
 *
 * Free tier Meta: 1000 conversation/bulan. Conversation = 24-jam
 * window dengan 1 nomor recipient. Cukup untuk skala Kos Baiti.
 *
 * Endpoint: https://graph.facebook.com/{version}/{phone-id}/messages
 *
 * Env yang dibutuhkan:
 *  - META_WA_PHONE_ID: phone number ID dari Meta Business Manager
 *  - META_WA_TOKEN: System User permanent access token
 *  - META_WA_API_VERSION: default "v18.0" (atau versi lebih baru)
 *
 * Setup di Meta side: lihat docs/wa-cloud/setup.md
 */

const API_VERSION_DEFAULT = "v18.0";

export type CloudResult = {
  /** ID pesan dari Meta — bisa dipakai cek status delivery via webhook. */
  messageId?: string;
  raw?: unknown;
};

/**
 * Kirim template message yang sudah di-approve Meta. Ini cara WAJIB
 * untuk outbound business-initiated (welcome, reminder, dll) yang
 * dikirim di luar 24h conversation window.
 *
 * @param phone Nomor recipient format internasional tanpa "+"
 *              (mis. "628123456789").
 * @param templateName Slug template yang sudah approved di Meta
 *              Business Manager (mis. "payment_reminder_h7").
 * @param bodyParams Array string untuk substitusi {{1}}, {{2}}, dst di
 *              body template.
 * @param headerImageUrl URL publik image untuk header (kalau template
 *              pakai header type IMAGE). Kosongkan kalau template
 *              hanya text header / no header.
 * @param language Bahasa template, default "id".
 */
export async function sendTemplate(
  phone: string,
  templateName: string,
  bodyParams: string[],
  headerImageUrl?: string,
  language: "id" | "en_US" = "id"
): Promise<CloudResult> {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;
  if (!phoneId || !token) {
    throw new Error(
      "META_WA_PHONE_ID / META_WA_TOKEN belum diset. Lihat docs/wa-cloud/setup.md."
    );
  }
  const apiVersion =
    process.env.META_WA_API_VERSION || API_VERSION_DEFAULT;

  const components: Array<Record<string, unknown>> = [];

  if (headerImageUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: headerImageUrl },
        },
      ],
    });
  }

  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams.map((p) => ({ type: "text", text: p })),
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    to: phone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length > 0 && { components }),
    },
  };

  const url = `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`;
  // eslint-disable-next-line no-console
  console.log(`[wa][cloud-template] ${templateName} → ${payload.to}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text().catch(() => "");
  // eslint-disable-next-line no-console
  console.log(`[wa][cloud-response] http=${res.status} body=${body.slice(0, 400)}`);
  if (!res.ok) {
    let parsed: { error?: { message?: string; code?: number } } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // ignore
    }
    throw new Error(
      `Meta Cloud API HTTP ${res.status}: ${parsed.error?.message ?? body.slice(0, 200)}`
    );
  }

  let parsed: { messages?: Array<{ id: string }> } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    // ignore
  }
  return { messageId: parsed.messages?.[0]?.id, raw: parsed };
}

/**
 * Kirim free-form text message. HANYA work di 24h window setelah
 * recipient mengirim pesan ke nomor Business kita (session message).
 *
 * Gunakan untuk: balas pertanyaan tenant, follow-up ad-hoc.
 * JANGAN untuk: reminder otomatis (pakai sendTemplate).
 *
 * Native support preview_url=true → URL preview card otomatis muncul.
 */
export async function sendFreeText(
  phone: string,
  text: string,
  options: { previewUrl?: boolean } = {}
): Promise<CloudResult> {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;
  if (!phoneId || !token) {
    throw new Error("META_WA_PHONE_ID / META_WA_TOKEN belum diset.");
  }
  const apiVersion =
    process.env.META_WA_API_VERSION || API_VERSION_DEFAULT;

  const payload = {
    messaging_product: "whatsapp",
    to: phone.replace(/^\+/, ""),
    type: "text",
    text: {
      body: text,
      preview_url: options.previewUrl ?? true,
    },
  };

  const url = `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`;
  // eslint-disable-next-line no-console
  console.log(`[wa][cloud-freetext] → ${payload.to} (${text.length} chars)`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text().catch(() => "");
  // eslint-disable-next-line no-console
  console.log(`[wa][cloud-response] http=${res.status} body=${body.slice(0, 400)}`);
  if (!res.ok) {
    let parsed: { error?: { message?: string } } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // ignore
    }
    throw new Error(
      `Meta Cloud API HTTP ${res.status}: ${parsed.error?.message ?? body.slice(0, 200)}`
    );
  }

  let parsed: { messages?: Array<{ id: string }> } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    // ignore
  }
  return { messageId: parsed.messages?.[0]?.id, raw: parsed };
}

/**
 * Cek kesehatan setup Cloud API tanpa kirim pesan beneran.
 * Panggil endpoint /me untuk verify token + phone_number_id valid.
 *
 * Berguna untuk admin diagnostic / test sebelum cutover.
 */
export async function pingCloudApi(): Promise<{
  ok: boolean;
  detail: string;
  raw?: unknown;
}> {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;
  if (!phoneId || !token) {
    return { ok: false, detail: "META_WA_PHONE_ID / META_WA_TOKEN belum diset." };
  }
  const apiVersion =
    process.env.META_WA_API_VERSION || API_VERSION_DEFAULT;

  try {
    const url = `https://graph.facebook.com/${apiVersion}/${phoneId}?fields=display_phone_number,verified_name,quality_rating`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    let parsed: {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
    } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // ignore
    }
    return {
      ok: true,
      detail: `Nomor: ${parsed.display_phone_number ?? "?"} • Nama verified: ${parsed.verified_name ?? "?"} • Kualitas: ${parsed.quality_rating ?? "?"}`,
      raw: parsed,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "Error",
    };
  }
}
