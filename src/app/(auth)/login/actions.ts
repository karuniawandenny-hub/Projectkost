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
  const emailRaw = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { error: "Email tidak valid." };
  if (password.length === 0) return { error: "Password wajib diisi." };

  const user = await prisma.user.findUnique({ where: { email } });
  // Jangan beri tahu apakah email ada atau tidak — untuk mencegah enumerasi.
  if (!user) return { error: "Email atau password salah." };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Email atau password salah." };

  await createSession({ userId: user.id, role: user.role as Role });

  if (user.role === "TENANT" && !user.onboardedAt) {
    redirect("/onboarding");
  }
  redirect("/dashboard");
}
