"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, isValidEmail, verifyPassword } from "@/lib/password";
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
  if (!identifier) return { error: "Email atau username wajib diisi." };
  if (password.length === 0) return { error: "Password wajib diisi." };

  // Kalau mengandung "@" -> anggap email. Selain itu -> anggap username.
  const isEmail = identifier.includes("@");
  let user;
  if (isEmail) {
    const email = normalizeEmail(identifier);
    if (!isValidEmail(email)) return { error: "Email tidak valid." };
    user = await prisma.user.findUnique({ where: { email } });
  } else {
    user = await prisma.user.findUnique({
      where: { username: identifier.toLowerCase() },
    });
  }

  // Jangan beritahu apakah identifier ada — cegah enumerasi akun.
  if (!user) return { error: "Email/username atau password salah." };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Email/username atau password salah." };

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
