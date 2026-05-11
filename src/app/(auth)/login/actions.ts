"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { generateOtp, hashOtp, sendOtp } from "@/lib/otp";
import { setDevOtpHint } from "@/lib/devOtpCookie";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const phoneRaw = String(formData.get("phone") ?? "");
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { error: "Nomor HP tidak valid." };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return { error: "Nomor HP belum terdaftar. Silakan daftar terlebih dahulu." };
  }

  const otp = generateOtp(6);
  const otpHash = await hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { otpHash, otpExpiresAt },
  });

  const send = await sendOtp(phone, otp);
  if (send.devOtp) setDevOtpHint(phone, send.devOtp);
  if (!send.delivered && !send.devOtp) {
    return {
      error: `Gagal mengirim OTP: ${send.error ?? "konfigurasi gateway tidak lengkap"}.`,
    };
  }

  redirect(`/verify?phone=${encodeURIComponent(phone)}&intent=login`);
}
