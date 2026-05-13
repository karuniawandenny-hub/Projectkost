"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, normalizeEmail, isValidEmail } from "@/lib/password";
import { createSession } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { notify } from "@/lib/notify";
import type { Role } from "@/lib/enums";

export type RegisterState = { error?: string };

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const role = String(formData.get("role") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (name.length < 2) return { error: "Nama wajib diisi (min 2 karakter)." };
  if (role !== "OWNER" && role !== "TENANT") {
    return { error: "Pilih peran terlebih dahulu." };
  }

  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { error: "Email tidak valid." };
  if (password.length < 8) {
    return { error: "Password minimal 8 karakter." };
  }
  if (password !== confirm) {
    return { error: "Konfirmasi password tidak cocok." };
  }

  let phone: string | null = null;
  if (phoneRaw) {
    const norm = normalizePhone(phoneRaw);
    if (!norm) return { error: "Nomor HP tidak valid. Kosongkan atau gunakan format 08xx." };
    phone = norm;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Email sudah terdaftar. Silakan masuk." };
  }

  const passwordHash = await hashPassword(password);

  // OWNER butuh persetujuan admin -> status PENDING, tidak auto-login.
  // TENANT bisa langsung pakai aplikasi -> status ACTIVE + auto-login.
  const status = role === "OWNER" ? "PENDING" : "ACTIVE";

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role,
      status,
      phone,
    },
  });

  if (role === "OWNER") {
    // Beritahu semua admin agar bisa segera meninjau.
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        notify({
          userId: a.id,
          type: "OWNER_PENDING",
          title: "Pendaftaran pemilik baru",
          message: `${user.name} (${user.email}) mengajukan akun pemilik kos.`,
          link: "/admin/users",
        })
      )
    );
    redirect("/register/pending");
  }

  await createSession({ userId: user.id, role: user.role as Role });
  redirect("/onboarding");
}
