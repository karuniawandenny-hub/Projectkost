import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { sendFreeText } from "@/lib/wa-cloud";
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
 * GET /api/wa/inbound — verifikasi webhook Meta.
 *
 * Saat pertama kali daftarkan webhook di Meta Business Manager, Meta
 * akan kirim GET dengan query:
 *   hub.mode=subscribe
 *   hub.verify_token=<token-yang-kita-set>
 *   hub.challenge=<random-string>
 *
 * Kita balas `hub.challenge` apa adanya kalau verify_token cocok.
 * Set env META_WA_WEBHOOK_VERIFY_TOKEN ke string rahasia yang sama.
 */
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

type MetaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
};

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: MetaMessage[];
      };
    }>;
  }>;
};

/**
 * POST /api/wa/inbound — terima pesan WA dari Meta.
 *
 * Alur:
 *  1. Parse semua message dari payload.
 *  2. Untuk tiap pesan tipe "text":
 *     a. Cocokkan `from` (nomor pengirim) ke User.phone (semua format).
 *     b. Cek role — Phase 2 ini hanya untuk TENANT. Owner & admin
 *        diarahkan balik ke app web.
 *     c. Cek duplikat (metaMessageId) — Meta sering retry.
 *     d. Load 20 turn terakhir dari WaChatMessage, append pesan user.
 *     e. Panggil runChatTurn() → dapat reply text.
 *     f. Kirim balik via sendFreeText().
 *     g. Simpan kedua pesan (user + assistant) ke DB.
 *  3. Selalu balas 200 ke Meta supaya tidak retry. Error apapun di-log
 *     + kirim pesan error ramah ke user (kalau memungkinkan).
 */
export async function POST(req: Request) {
  let payload: MetaWebhookPayload;
  try {
    payload = (await req.json()) as MetaWebhookPayload;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const messages: MetaMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        messages.push(m);
      }
    }
  }

  // Proses sequentially supaya pesan dari user yang sama urut.
  for (const m of messages) {
    try {
      await handleMessage(m);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[wa-inbound] error processing msg", m.id, e);
    }
  }

  // Selalu 200, Meta sensitif terhadap non-2xx → kalau gagal mereka retry.
  return NextResponse.json({ ok: true });
}

async function handleMessage(m: MetaMessage) {
  if (m.type !== "text" || !m.text?.body) {
    // Phase 2 hanya support text. Image/voice/sticker → tolak sopan.
    await trySend(
      m.from,
      "Maaf, saat ini saya hanya bisa membaca pesan teks. Silakan ketik pertanyaan Anda."
    );
    return;
  }

  const body = m.text.body.trim();
  if (!body) return;

  // Anti-duplikat: Meta retry kalau response telat / 5xx.
  const existing = await prisma.waChatMessage.findUnique({
    where: { metaMessageId: m.id },
  });
  if (existing) return;

  const fromNormalized = toWhatsAppFormat(m.from);
  if (!fromNormalized) {
    await trySend(
      m.from,
      "Nomor Anda tidak dapat dikenali. Hubungi pemilik kos."
    );
    return;
  }

  // Cari user dengan phone yang sama (semua varian: +62.., 08.., 62..).
  // Karena User.phone disimpan dalam berbagai format historis, ambil
  // semua user dengan phone non-null lalu cocokkan setelah normalisasi.
  // Untuk skala app ini (puluhan-ratusan user) ini OK; kalau besar
  // nanti tambah field phoneE164 yang sudah ternormalisasi.
  const candidates = await prisma.user.findMany({
    where: { phone: { not: null }, status: { not: "SUSPENDED" } },
    select: { id: true, name: true, phone: true, role: true },
  });
  const user = candidates.find(
    (u) => toWhatsAppFormat(u.phone) === fromNormalized
  );

  if (!user) {
    await trySend(
      m.from,
      "Nomor Anda belum terdaftar di Kos Baiti. Hubungi pemilik untuk mendaftar, atau pastikan nomor di profil app Anda cocok dengan nomor WhatsApp ini."
    );
    return;
  }

  if (user.role !== "TENANT") {
    await trySend(
      m.from,
      "Halo " +
        user.name +
        "! Untuk pemilik & admin, asisten AI tersedia di app web (tombol ✨ di pojok kanan-bawah). Di sana Anda bisa lihat laporan keuangan, daftar penghuni, dan komplain dengan format tabel."
    );
    return;
  }

  if (!isChatConfigured()) {
    await trySend(
      m.from,
      "Maaf, asisten AI sedang tidak aktif. Hubungi admin atau buka app langsung."
    );
    return;
  }

  const me: ChatUser = {
    id: user.id,
    name: user.name,
    role: "TENANT",
  };

  // Load history 20 turn terakhir untuk konteks.
  const history = await prisma.waChatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });
  const messages: Anthropic.MessageParam[] = history
    .reverse()
    .map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.content,
    }));
  messages.push({ role: "user", content: body });

  let reply: string;
  try {
    reply = await runChatTurn(me, messages);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] AI error:", e);
    await trySend(
      m.from,
      "Maaf, ada gangguan di asisten AI. Coba lagi dalam beberapa menit."
    );
    return;
  }

  if (!reply) reply = "Maaf, saya tidak punya jawaban untuk itu sekarang.";

  // Kirim balik. Kalau gagal, tetap simpan ke DB supaya konteks tidak
  // hilang (user mungkin tanya hal lain berikutnya).
  await trySend(m.from, reply);

  // Simpan kedua pesan ke history. metaMessageId hanya untuk pesan user
  // (anti-duplikat); assistant tidak punya.
  await prisma.$transaction([
    prisma.waChatMessage.create({
      data: {
        userId: user.id,
        role: "user",
        content: body,
        metaMessageId: m.id,
      },
    }),
    prisma.waChatMessage.create({
      data: {
        userId: user.id,
        role: "assistant",
        content: reply,
      },
    }),
  ]);
}

async function trySend(phone: string, text: string) {
  try {
    await sendFreeText(phone, text, { previewUrl: false });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] send error:", e);
  }
}
