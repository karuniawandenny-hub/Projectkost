import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
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
 * POST /api/wa/inbound — terima pesan WhatsApp masuk dari Fonnte.
 *
 * Setup di sisi Fonnte:
 *  1. Dashboard Fonnte > Device > Edit > "Webhook URL"
 *     isi dengan: https://<domain>/api/wa/inbound?secret=<FONNTE_WEBHOOK_SECRET>
 *  2. "Incoming" toggle = ON (di dashboard device).
 *  3. Format webhook = "Form" (default) atau "JSON" — handler ini dukung dua-duanya.
 *
 * Security:
 *  Fonnte tidak punya tanda tangan webhook resmi. Kita pakai shared
 *  secret di query string (?secret=...) yang dicocokkan dengan env
 *  FONNTE_WEBHOOK_SECRET. URL ini tidak boleh bocor.
 *
 * Format body Fonnte (form-urlencoded atau JSON):
 *   device     - nomor device Fonnte (penerima)
 *   sender     - nomor pengirim (628xxx)
 *   message    - isi pesan
 *   name       - pushname pengirim
 *   member     - hanya ada kalau pesan dari grup → diabaikan (hanya 1-on-1)
 *   url        - URL attachment (untuk pesan media — kita abaikan)
 *   filename   - nama file kalau ada
 *   extension  - ekstensi file kalau ada
 *
 * Penting:
 *  - Pesan dari GRUP (ada field `member`) di-skip — bot hanya untuk 1-on-1.
 *  - Pesan non-teks (ada `url`) dijawab dengan permintaan teks.
 */
export async function POST(req: Request) {
  // 1. Verifikasi secret
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.FONNTE_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    // Jangan kasih info kenapa gagal — tetap 200 supaya tidak retry.
    // eslint-disable-next-line no-console
    console.warn("[wa-inbound] secret invalid");
    return NextResponse.json({ ok: true });
  }

  // 2. Parse body — dukung form-urlencoded & JSON (Fonnte bisa keduanya)
  const data = await parseBody(req);
  if (!data) return NextResponse.json({ ok: true });

  try {
    await handleMessage(data);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] error:", e);
  }

  // Selalu 200, Fonnte sensitif terhadap non-2xx → retry kalau gagal.
  return NextResponse.json({ ok: true });
}

type FonnteBody = {
  sender?: string;
  message?: string;
  name?: string;
  member?: string;
  url?: string;
  filename?: string;
  device?: string;
};

async function parseBody(req: Request): Promise<FonnteBody | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      return {
        sender: str(j.sender),
        message: str(j.message),
        name: str(j.name),
        member: str(j.member),
        url: str(j.url),
        filename: str(j.filename),
        device: str(j.device),
      };
    }
    // Default form-urlencoded / multipart
    const form = await req.formData();
    return {
      sender: str(form.get("sender")),
      message: str(form.get("message")),
      name: str(form.get("name")),
      member: str(form.get("member")),
      url: str(form.get("url")),
      filename: str(form.get("filename")),
      device: str(form.get("device")),
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] parse error:", e);
    return null;
  }
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  return String(v);
}

async function handleMessage(data: FonnteBody) {
  const sender = data.sender?.trim();
  const message = data.message?.trim();
  if (!sender) return;

  // Skip pesan grup (ada field member = nomor anggota dalam grup).
  if (data.member) {
    // eslint-disable-next-line no-console
    console.log(`[wa-inbound] skip group message from ${sender}`);
    return;
  }

  // Skip echo dari diri sendiri (Fonnte kadang forward pesan keluar).
  if (data.device && data.device.replace(/\D/g, "") === sender.replace(/\D/g, "")) {
    return;
  }

  if (!message) {
    await trySend(
      sender,
      "Maaf, saat ini saya hanya bisa membaca pesan teks. Silakan ketik pertanyaan Anda."
    );
    return;
  }

  // Anti-duplikat sederhana: kalau pesan sama persis dari sender yang sama
  // muncul dalam <30 detik, anggap retry. Fonnte tidak kasih message ID
  // konsisten jadi kita pakai kombinasi sender+content+waktu.
  const recentDuplicate = await prisma.waChatMessage.findFirst({
    where: {
      role: "user",
      content: message,
      user: { phone: { not: null } },
      createdAt: { gte: new Date(Date.now() - 30_000) },
    },
    include: { user: { select: { phone: true } } },
  });
  if (
    recentDuplicate &&
    toWhatsAppFormat(recentDuplicate.user.phone) === toWhatsAppFormat(sender)
  ) {
    return;
  }

  const senderNormalized = toWhatsAppFormat(sender);
  if (!senderNormalized) {
    await trySend(sender, "Nomor Anda tidak dapat dikenali.");
    return;
  }

  // Cari user dengan phone yang sama — User.phone disimpan dalam
  // berbagai format historis, jadi normalisasi semua kandidat.
  const candidates = await prisma.user.findMany({
    where: { phone: { not: null }, status: { not: "SUSPENDED" } },
    select: { id: true, name: true, phone: true, role: true },
  });
  const user = candidates.find(
    (u) => toWhatsAppFormat(u.phone) === senderNormalized
  );

  if (!user) {
    await trySend(
      sender,
      "Nomor Anda belum terdaftar di Kos Baiti. Hubungi pemilik untuk mendaftar, atau pastikan nomor di profil app Anda cocok dengan nomor WhatsApp ini."
    );
    return;
  }

  if (user.role !== "TENANT") {
    await trySend(
      sender,
      `Halo ${user.name}! Untuk pemilik & admin, asisten AI tersedia di app web (tombol ✨ di pojok kanan-bawah). Di sana Anda bisa lihat laporan keuangan, daftar penghuni, dan komplain dengan format tabel.`
    );
    return;
  }

  if (!isChatConfigured()) {
    await trySend(
      sender,
      "Maaf, asisten AI sedang tidak aktif. Hubungi admin atau buka app langsung."
    );
    return;
  }

  const me: ChatUser = { id: user.id, name: user.name, role: "TENANT" };

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
  messages.push({ role: "user", content: message });

  let reply: string;
  try {
    reply = await runChatTurn(me, messages);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] AI error:", e);
    await trySend(
      sender,
      "Maaf, ada gangguan di asisten AI. Coba lagi dalam beberapa menit."
    );
    return;
  }

  if (!reply) reply = "Maaf, saya tidak punya jawaban untuk itu sekarang.";

  await trySend(sender, reply);

  await prisma.$transaction([
    prisma.waChatMessage.create({
      data: {
        userId: user.id,
        role: "user",
        content: message,
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
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!token) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] WA_GATEWAY_TOKEN belum diset — reply diabaikan");
    return;
  }
  try {
    await fonnteSend(token, phone, text);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[wa-inbound] send error:", e);
  }
}
