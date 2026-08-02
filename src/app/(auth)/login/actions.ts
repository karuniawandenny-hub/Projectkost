"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, isValidEmail, verifyPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { createSession } from "@/lib/session";
import type { Role } from "@/lib/enums";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const identifierRaw = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");

  const identifier = identifierRaw.trim();
  if (!identifier) return { error: "HP / email / username wajib diisi." };
  if (password.length === 0) return { error: "Password wajib diisi." };

  // Aturan lookup identifier — dicoba berurutan sampai ketemu:
  //   1. Kalau mengandung "@" → email (path paling common untuk user
  //      lama yang self-register).
  //   2. Kalau bisa dinormalisasi jadi nomor HP valid → cari via
  //      User.phone. Ini path baru untuk penghuni yang didaftarkan
  //      pemilik (email fiktif, tidak dipakai).
  //   3. Selain itu → username lowercase.
  const isEmail = identifier.includes("@");
  let user;
  if (isEmail) {
    const email = normalizeEmail(identifier);
    if (!isValidEmail(email)) return { error: "Email tidak valid." };
    user = await prisma.user.findUnique({ where: { email } });
  } else {
    const asPhone = normalizePhone(identifier);
    if (asPhone) {
      user = await prisma.user.findFirst({ where: { phone: asPhone } });
    }
    if (!user) {
      user = await prisma.user.findUnique({
        where: { username: identifier.toLowerCase() },
      });
    }
  }

  // Jangan beritahu apakah identifier ada — cegah enumerasi akun.
  if (!user) return { error: "Kredensial salah." };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Kredensial salah." };

  if (user.status === "PENDING") {
    // TENANT yang PENDING masih boleh login agar bisa onboarding / lihat
    // halaman menunggu persetujuan; akses ke fitur lain dibatasi di
    // (app)/layout. OWNER PENDING tidak bisa login sama sekali.
    if (user.role === "OWNER") {
      return {
        error:
          "Akun pemilik Anda sedang menunggu persetujuan admin. Silakan coba lagi nanti.",
      };
    }
  }
  if (user.status === "SUSPENDED") {
    return {
      error: "Akun Anda dinonaktifkan. Hubungi administrator.",
    };
  }

  await createSession({ userId: user.id, role: user.role as Role });

  if (user.role === "ADMIN") {
    redirect("/admin");
  }
  if (user.role === "TENANT" && !user.onboardedAt) {
    redirect("/onboarding");
  }
  redirect("/dashboard");
}
