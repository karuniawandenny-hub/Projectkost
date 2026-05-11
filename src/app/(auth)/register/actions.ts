"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { generateOtp, hashOtp, sendOtp } from "@/lib/otp";
import { setDevOtpHint } from "@/lib/devOtpCookie";

export type RegisterState = { error?: string };

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "");
  const role = String(formData.get("role") ?? "");

  if (name.length < 2) return { error: "Nama wajib diisi (min 2 karakter)." };
  if (role !== "OWNER" && role !== "TENANT") {
    return { error: "Pilih peran terlebih dahulu." };
  }
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { error: "Nomor HP tidak valid." };

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return { error: "Nomor HP sudah terdaftar. Silakan masuk." };
  }

  const otp = generateOtp(6);
  const otpHash = await hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.user.create({
    data: {
      phone,
      name,
      role,
      otpHash,
      otpExpiresAt,
    },
  });

  const send = await sendOtp(phone, otp);
  if (send.devOtp) setDevOtpHint(phone, send.devOtp);
  if (!send.delivered && !send.devOtp) {
    return {
      error: `Gagal mengirim OTP: ${send.error ?? "konfigurasi gateway tidak lengkap"}.`,
    };
  }

  redirect(`/verify?phone=${encodeURIComponent(phone)}&intent=register`);
}
