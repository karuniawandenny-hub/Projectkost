"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { verifyOtp, generateOtp, hashOtp, sendOtp } from "@/lib/otp";
import { createSession } from "@/lib/session";
import type { Role } from "@/lib/enums";

export type VerifyState = { error?: string; info?: string };

export async function verifyAction(
  _prev: VerifyState,
  formData: FormData
): Promise<VerifyState> {
  const phoneRaw = String(formData.get("phone") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { error: "Nomor HP tidak valid." };
  if (!/^[0-9]{6}$/.test(code)) return { error: "Kode OTP harus 6 digit." };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.otpHash || !user.otpExpiresAt) {
    return { error: "OTP tidak ditemukan. Minta OTP baru." };
  }
  if (user.otpExpiresAt.getTime() < Date.now()) {
    return { error: "OTP kedaluwarsa. Minta OTP baru." };
  }

  const ok = await verifyOtp(code, user.otpHash);
  if (!ok) return { error: "Kode OTP salah." };

  await prisma.user.update({
    where: { id: user.id },
    data: { otpHash: null, otpExpiresAt: null },
  });

  await createSession({ userId: user.id, role: user.role as Role });

  // Penghuni wajib onboarding (KTP + selfie) sebelum masuk aplikasi.
  if (user.role === "TENANT" && !user.onboardedAt) {
    redirect("/onboarding");
  }
  redirect("/dashboard");
}

export async function resendOtpAction(formData: FormData): Promise<VerifyState> {
  const phoneRaw = String(formData.get("phone") ?? "");
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { error: "Nomor HP tidak valid." };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return { error: "User tidak ditemukan." };

  const otp = generateOtp(6);
  const otpHash = await hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: { otpHash, otpExpiresAt },
  });
  await sendOtp(phone, otp);

  return { info: "OTP baru telah dikirim." };
}
