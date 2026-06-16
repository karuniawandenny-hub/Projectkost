import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { toWhatsAppFormat } from "@/lib/phone";
import { providerStatus } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/diagnose — admin-only, cek konfigurasi WhatsApp + AI chat.
 *
 * Pakai untuk troubleshoot kenapa bot tidak respon. Tidak expose nilai
 * env, hanya status set/not-set + connectivity check ringan.
 *
 * Akses: hanya OWNER/ADMIN yang login.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const provider = (
    process.env.WA_INBOUND_PROVIDER ?? "fonnte"
  ).toLowerCase();

  // Hitung user dengan phone untuk verifikasi data ada
  const usersWithPhone = await prisma.user.count({
    where: { phone: { not: null }, status: { not: "SUSPENDED" } },
  });
  const tenantsWithPhone = await prisma.user.count({
    where: { phone: { not: null }, role: "TENANT", status: "ACTIVE" },
  });

  // Sample phone normalisasi (5 user pertama untuk debug nomor mismatch)
  const sample = await prisma.user.findMany({
    where: { phone: { not: null }, role: "TENANT" },
    select: { id: true, name: true, phone: true },
    take: 5,
    orderBy: { createdAt: "desc" },
  });
  const sampleNormalized = sample.map((u) => ({
    name: u.name,
    raw: u.phone,
    normalized: toWhatsAppFormat(u.phone),
  }));

  const env = {
    WA_INBOUND_PROVIDER: provider,
    OTP_MODE: process.env.OTP_MODE ?? "(unset)",
    WA_ENABLED: process.env.WA_ENABLED ?? "(default: true)",
  };

  const fonnte = {
    FONNTE_WEBHOOK_SECRET: !!process.env.FONNTE_WEBHOOK_SECRET,
    WA_GATEWAY_TOKEN: !!process.env.WA_GATEWAY_TOKEN,
  };

  const meta = {
    META_WA_PHONE_ID: !!process.env.META_WA_PHONE_ID,
    META_WA_TOKEN: !!process.env.META_WA_TOKEN,
    META_WA_WEBHOOK_VERIFY_TOKEN: !!process.env.META_WA_WEBHOOK_VERIFY_TOKEN,
  };

  const aiProvider = providerStatus();
  const ai = {
    primary: aiProvider.primary,
    GEMINI_API_KEY: aiProvider.gemini,
    ANTHROPIC_API_KEY: aiProvider.anthropic,
    fallbackAvailable: aiProvider.fallbackAvailable,
  };

  const issues: string[] = [];
  if (!aiProvider.gemini && !aiProvider.anthropic) {
    issues.push(
      "Tidak ada API key AI yang diset (GEMINI_API_KEY atau ANTHROPIC_API_KEY). Bot tidak akan jawab apapun."
    );
  } else if (aiProvider.primary === "gemini" && !aiProvider.gemini) {
    issues.push(
      "AI_PROVIDER=gemini tapi GEMINI_API_KEY belum diset. Daftar gratis di https://aistudio.google.com/apikey."
    );
  } else if (aiProvider.primary === "anthropic" && !aiProvider.anthropic) {
    issues.push(
      "AI_PROVIDER=anthropic tapi ANTHROPIC_API_KEY belum diset."
    );
  }
  if (!aiProvider.fallbackAvailable) {
    issues.push(
      `Tidak ada fallback provider. Kalau ${aiProvider.primary} down/rate-limited, bot diam. Disarankan set juga key provider yang lain.`
    );
  }
  if (provider === "fonnte") {
    if (!fonnte.FONNTE_WEBHOOK_SECRET) {
      issues.push(
        "FONNTE_WEBHOOK_SECRET belum diset — webhook akan menolak semua request Fonnte."
      );
    }
    if (!fonnte.WA_GATEWAY_TOKEN) {
      issues.push(
        "WA_GATEWAY_TOKEN belum diset — bot tidak bisa kirim balasan via Fonnte."
      );
    }
  } else if (provider === "meta") {
    if (!meta.META_WA_PHONE_ID || !meta.META_WA_TOKEN) {
      issues.push(
        "META_WA_PHONE_ID / META_WA_TOKEN belum diset — bot tidak bisa kirim balasan via Meta."
      );
    }
    if (!meta.META_WA_WEBHOOK_VERIFY_TOKEN) {
      issues.push(
        "META_WA_WEBHOOK_VERIFY_TOKEN belum diset — webhook verification Meta akan gagal."
      );
    }
  }
  if (tenantsWithPhone === 0) {
    issues.push(
      "Tidak ada user TENANT aktif dengan nomor HP — tidak ada yang bisa pakai bot WA."
    );
  }

  return NextResponse.json({
    provider,
    env,
    fonnte,
    meta,
    ai,
    db: {
      usersWithPhone,
      tenantsActiveWithPhone: tenantsWithPhone,
      sample: sampleNormalized,
    },
    issues,
    webhookUrlFonnte:
      provider === "fonnte" && fonnte.FONNTE_WEBHOOK_SECRET
        ? `/api/wa/inbound?secret=<FONNTE_WEBHOOK_SECRET>`
        : null,
    webhookUrlMeta:
      provider === "meta" ? `/api/wa/inbound` : null,
    healthy: issues.length === 0,
  });
}
