"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, isValidEmail } from "@/lib/password";
import {
  generateResetToken,
  sendPasswordResetEmail,
} from "@/lib/email";

export type ForgotState = {
  error?: string;
  info?: string;
  /** Hanya terisi di mode dev untuk ditampilkan ke user. */
  devLink?: string;
};

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 jam

function originFromHeaders(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const emailRaw = String(formData.get("email") ?? "");
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { error: "Email tidak valid." };

  // Tetap balas sukses meski email tidak terdaftar — agar tidak bisa dipakai
  // untuk enumerasi akun. Kalau user ditemukan, baru proses pembuatan token.
  const user = await prisma.user.findUnique({ where: { email } });
  const genericInfo =
    "Jika email terdaftar, kami sudah mengirim link reset ke kotak masuk Anda.";

  if (!user) {
    return { info: genericInfo };
  }

  // Invalidasi token aktif sebelumnya untuk user ini (opsional, supaya 1 token aktif).
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const { token, tokenHash } = generateResetToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${originFromHeaders()}/reset-password?token=${token}`;
  const send = await sendPasswordResetEmail(email, resetUrl);

  if (!send.delivered && !send.devLink) {
    return {
      error: `Gagal mengirim email reset: ${send.error ?? "konfigurasi email tidak lengkap"}.`,
    };
  }

  return {
    info: send.devLink
      ? "Link reset di bawah (mode dev — tidak benar-benar dikirim ke email)."
      : genericInfo,
    devLink: send.devLink,
  };
}
