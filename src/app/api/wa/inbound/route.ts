import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { sendFreeText } from "@/lib/wa-cloud";
import { fonnteSend } from "@/lib/reminders";
import { toWhatsAppFormat } from "@/lib/phone";
import {
  isChatConfigured,
  runChatTurn,
  type ChatUser,
} from "@/lib/ai-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HISTORY_TURNS = 20;

/**
 * Dual-provider WhatsApp inbound webhook. Pilih provider lewat env:
 *
 *   WA_INBOUND_PROVIDER=fonnte   ← default (Meta sedang restricted, atau
 *                                  Anda memang pakai Fonnte)
 *   WA_INBOUND_PROVIDER=meta     ← setelah Meta verified & unblocked
 *
 * Ganti provider = ubah 1 env var saja. Logika inti (match user, jalankan
 * AI, simpan riwayat, balas) dipakai bersama. Yang berbeda hanya:
 *  - cara parse payload masuk
 *  - cara verifikasi keaslian webhook
 *  - cara kirim balasan
 *
 * Setup webhook URL:
 *   Fonnte: https://<domain>/api/wa/inbound?secret=<FONNTE_WEBHOOK_SECRET>
 *   Meta:   https://<domain>/api/wa/inbound (verify token via GET)
 */
type Provider = "fonnte" | "meta";

function currentProvider(): Provider {
  const v = (process.env.WA_INBOUND_PROVIDER ?? "fonnte").toLowerCase();
  return v === "meta" ? "meta" : "fonnte";
}

// =============================================================
// GET — verifikasi webhook Meta (hub.challenge)
// =============================================================
// Hanya Meta yang panggil GET; Fonnte tidak punya verification flow
// seperti ini. Tetap aktifkan supaya kalau provider dipindah ke meta,
// tidak perlu redeploy.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WA_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// =============================================================
// POST — dispatch ke provider yang aktif
// =============================================================
export async function POST(req: Request) {
  // eslint-disable-next-line no-console
  console.log(
    `[wa-inbound] POST received provider=${currentProvider()} content-type=${req.headers.get("content-type") ?? "-"}`
  );
  try {
    if (currentProvider() === "meta") {
      return await handleMetaPost(req);
    }
    return await handleFonntePost(req);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] top-level error:", e);
    // Tetap 200 supaya provider tidak retry — error sudah di-log.
    return NextResponse.json({ ok: true });
  }
}

// =============================================================
// META PROVIDER
// =============================================================
type MetaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
};

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{ value?: { messages?: MetaMessage[] } }>;
  }>;
};

async function handleMetaPost(req: Request): Promise<NextResponse> {
  let payload: MetaWebhookPayload;
  try {
    payload = (await req.json()) as MetaWebhookPayload;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const messages: MetaMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) messages.push(m);
    }
  }

  for (const m of messages) {
    try {
      if (m.type !== "text" || !m.text?.body) {
        await metaSend(
          m.from,
          "Maaf, saat ini saya hanya bisa membaca pesan teks. Silakan ketik pertanyaan Anda."
        );
        continue;
      }
      await handleIncoming(m.from, m.text.body.trim(), {
        send: metaSend,
        messageId: m.id,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[wa-inbound][meta] error msg", m.id, e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function metaSend(phone: string, text: string): Promise<void> {
  try {
    await sendFreeText(phone, text, { previewUrl: false });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound][meta] send error:", e);
  }
}

// =============================================================
// FONNTE PROVIDER
// =============================================================
type FonnteBody = {
  sender?: string;
  message?: string;
  member?: string;
  device?: string;
};

async function handleFonntePost(req: Request): Promise<NextResponse> {
  // Shared secret di query string.
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.FONNTE_WEBHOOK_SECRET;
  if (!expected) {
    // eslint-disable-next-line no-console
    console.error(
      "[wa-inbound][fonnte] FONNTE_WEBHOOK_SECRET belum diset di env — webhook ditolak"
    );
    return NextResponse.json({ ok: true });
  }
  if (secret !== expected) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wa-inbound][fonnte] secret tidak cocok — pastikan URL webhook di Fonnte = "?secret=${expected.slice(0, 4)}..." (received: "${secret?.slice(0, 4) ?? "null"}...")`
    );
    return NextResponse.json({ ok: true });
  }
  // eslint-disable-next-line no-console
  console.log("[wa-inbound][fonnte] secret OK");

  const data = await parseFonnteBody(req);
  if (!data) {
    // eslint-disable-next-line no-console
    console.warn("[wa-inbound][fonnte] body parse gagal");
    return NextResponse.json({ ok: true });
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wa-inbound][fonnte] parsed: sender=${data.sender ?? "-"} device=${data.device ?? "-"} member=${data.member ? "ya" : "tidak"} msg_len=${data.message?.length ?? 0}`
  );

  const sender = data.sender?.trim();
  if (!sender) {
    // eslint-disable-next-line no-console
    console.warn("[wa-inbound][fonnte] sender kosong");
    return NextResponse.json({ ok: true });
  }

  // Skip pesan dari grup (field member ada).
  if (data.member) {
    // eslint-disable-next-line no-console
    console.log(`[wa-inbound][fonnte] skip pesan grup dari ${sender}`);
    return NextResponse.json({ ok: true });
  }
  // Skip echo dari device sendiri (Fonnte kadang forward outbound).
  if (
    data.device &&
    data.device.replace(/\D/g, "") === sender.replace(/\D/g, "")
  ) {
    // eslint-disable-next-line no-console
    console.log("[wa-inbound][fonnte] skip echo dari device sendiri");
    return NextResponse.json({ ok: true });
  }

  const body = data.message?.trim();
  if (!body) {
    // eslint-disable-next-line no-console
    console.log(
      `[wa-inbound][fonnte] pesan non-teks dari ${sender}, minta ketik teks`
    );
    await fonnteSendSafe(
      sender,
      "Maaf, saat ini saya hanya bisa membaca pesan teks. Silakan ketik pertanyaan Anda."
    );
    return NextResponse.json({ ok: true });
  }

  try {
    await handleIncoming(sender, body, { send: fonnteSendSafe });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound][fonnte] error:", e);
  }
  return NextResponse.json({ ok: true });
}

async function parseFonnteBody(req: Request): Promise<FonnteBody | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      return {
        sender: str(j.sender),
        message: str(j.message),
        member: str(j.member),
        device: str(j.device),
      };
    }
    const form = await req.formData();
    return {
      sender: str(form.get("sender")),
      message: str(form.get("message")),
      member: str(form.get("member")),
      device: str(form.get("device")),
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound][fonnte] parse error:", e);
    return null;
  }
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  return typeof v === "string" ? v : String(v);
}

async function fonnteSendSafe(phone: string, text: string): Promise<void> {
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!token) {
    // eslint-disable-next-line no-console
    console.error(
      "[wa-inbound][fonnte] WA_GATEWAY_TOKEN belum diset — reply diabaikan"
    );
    return;
  }
  try {
    await fonnteSend(token, phone, text);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound][fonnte] send error:", e);
  }
}

// =============================================================
// SHARED CORE — match user, jalankan AI, simpan riwayat, balas
// =============================================================
type ProviderCtx = {
  /** Kirim teks balasan ke nomor user. */
  send: (phone: string, text: string) => Promise<void>;
  /** Anti-duplikat berbasis ID provider. Kosongkan kalau provider tidak
   *  punya ID stabil (Fonnte) — dedup fallback ke content+time window. */
  messageId?: string;
};

async function handleIncoming(
  senderPhone: string,
  body: string,
  ctx: ProviderCtx
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[wa-inbound] handleIncoming from=${senderPhone} body="${body.slice(0, 60)}${body.length > 60 ? "…" : ""}"`
  );

  // Dedup
  if (ctx.messageId) {
    const existing = await prisma.waChatMessage.findUnique({
      where: { metaMessageId: ctx.messageId },
    });
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`[wa-inbound] dedup hit messageId=${ctx.messageId}`);
      return;
    }
  }

  const fromNormalized = toWhatsAppFormat(senderPhone);
  if (!fromNormalized) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wa-inbound] nomor pengirim tidak valid format: "${senderPhone}"`
    );
    await ctx.send(
      senderPhone,
      "Nomor Anda tidak dapat dikenali. Hubungi pemilik kos."
    );
    return;
  }

  // Cari user — User.phone disimpan dalam berbagai format historis,
  // jadi ambil semua kandidat lalu cocokkan setelah normalisasi.
  const candidates = await prisma.user.findMany({
    where: { phone: { not: null }, status: { not: "SUSPENDED" } },
    select: { id: true, name: true, phone: true, role: true },
  });
  const user = candidates.find(
    (u) => toWhatsAppFormat(u.phone) === fromNormalized
  );

  if (!user) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wa-inbound] tidak ada user dengan phone=${fromNormalized} (dicari di ${candidates.length} kandidat)`
    );
    await ctx.send(
      senderPhone,
      "Nomor Anda belum terdaftar di Kos Baiti. Hubungi pemilik untuk mendaftar, atau pastikan nomor di profil app Anda cocok dengan nomor WhatsApp ini."
    );
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wa-inbound] user match: id=${user.id} name="${user.name}" role=${user.role}`
  );

  if (user.role !== "TENANT") {
    // eslint-disable-next-line no-console
    console.log(
      `[wa-inbound] role bukan TENANT (${user.role}), redirect ke app web`
    );
    await ctx.send(
      senderPhone,
      `Halo ${user.name}! Untuk pemilik & admin, asisten AI tersedia di app web (tombol ✨ di pojok kanan-bawah). Di sana Anda bisa lihat laporan keuangan, daftar penghuni, dan komplain dengan format tabel.`
    );
    return;
  }

  // Fallback dedup untuk provider tanpa messageId stabil (Fonnte):
  // kalau pesan identik dari user yang sama muncul <30 detik, anggap retry.
  if (!ctx.messageId) {
    const recent = await prisma.waChatMessage.findFirst({
      where: {
        userId: user.id,
        role: "user",
        content: body,
        createdAt: { gte: new Date(Date.now() - 30_000) },
      },
      select: { id: true },
    });
    if (recent) return;
  }

  if (!isChatConfigured()) {
    // eslint-disable-next-line no-console
    console.error(
      "[wa-inbound] ANTHROPIC_API_KEY belum diset — chatbot tidak bisa jalan"
    );
    await ctx.send(
      senderPhone,
      "Maaf, asisten AI sedang tidak aktif. Hubungi admin atau buka app langsung."
    );
    return;
  }

  const me: ChatUser = { id: user.id, name: user.name, role: "TENANT" };

  const history = await prisma.waChatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });
  const messages: Anthropic.MessageParam[] = history.reverse().map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.content,
  }));
  messages.push({ role: "user", content: body });

  // eslint-disable-next-line no-console
  console.log(
    `[wa-inbound] memanggil Claude (history=${history.length}, total messages=${messages.length})`
  );
  const startedAt = Date.now();
  let reply: string;
  try {
    reply = await runChatTurn(me, messages);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] AI error:", e);
    await ctx.send(
      senderPhone,
      "Maaf, ada gangguan di asisten AI. Coba lagi dalam beberapa menit."
    );
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wa-inbound] Claude reply ${reply.length} chars dalam ${Date.now() - startedAt}ms`
  );
  if (!reply) reply = "Maaf, saya tidak punya jawaban untuk itu sekarang.";

  // eslint-disable-next-line no-console
  console.log(`[wa-inbound] kirim balasan ke ${senderPhone}`);
  await ctx.send(senderPhone, reply);
  // eslint-disable-next-line no-console
  console.log(`[wa-inbound] selesai untuk ${senderPhone}`);

  await prisma.$transaction([
    prisma.waChatMessage.create({
      data: {
        userId: user.id,
        role: "user",
        content: body,
        metaMessageId: ctx.messageId ?? null,
      },
    }),
    prisma.waChatMessage.create({
      data: { userId: user.id, role: "assistant", content: reply },
    }),
  ]);
}
