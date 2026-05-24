"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notify } from "@/lib/notify";

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

/**
 * Setujui user PENDING (role OWNER atau TENANT) -> ACTIVE.
 */
export async function approveUser(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("BAD_INPUT");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("NOT_FOUND");
  if (target.role !== "OWNER" && target.role !== "TENANT") {
    throw new Error("BAD_ROLE");
  }
  if (target.status === "ACTIVE") return;

  await prisma.user.update({
    where: { id: target.id },
    data: { status: "ACTIVE" },
  });
  await notify({
    userId: target.id,
    type: target.role === "OWNER" ? "OWNER_APPROVED" : "TENANT_APPROVED",
    title:
      target.role === "OWNER"
        ? "Akun pemilik Anda disetujui"
        : "Akun penghuni Anda disetujui",
    message:
      target.role === "OWNER"
        ? "Selamat! Akun pemilik Anda telah disetujui. Silakan masuk untuk mulai mengelola kos."
        : "Akun penghuni Anda telah disetujui oleh administrator. Silakan login & akses dashboard.",
    link: "/login",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${target.id}`);
}

/**
 * Tolak user PENDING -> SUSPENDED.
 */
export async function rejectUser(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("BAD_INPUT");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("NOT_FOUND");
  if (
    (target.role !== "OWNER" && target.role !== "TENANT") ||
    target.status !== "PENDING"
  ) {
    throw new Error("BAD_STATE");
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { status: "SUSPENDED" },
  });
  await notify({
    userId: target.id,
    type: target.role === "OWNER" ? "OWNER_REJECTED" : "TENANT_REJECTED",
    title: "Pengajuan akun ditolak",
    message:
      target.role === "OWNER"
        ? "Mohon maaf, pengajuan akun pemilik Anda tidak disetujui. Silakan hubungi administrator untuk informasi lebih lanjut."
        : "Mohon maaf, pengajuan akun penghuni Anda tidak disetujui.",
    link: "/login",
  });
  revalidatePath("/admin/users");
}

export async function setUserStatus(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["ACTIVE", "SUSPENDED"].includes(status)) {
    throw new Error("BAD_STATUS");
  }
  const me = await requireAdmin();
  if (me.id === userId) throw new Error("CANNOT_MODIFY_SELF");

  await prisma.user.update({
    where: { id: userId },
    data: { status },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function setUserRole(formData: FormData) {
  const me = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!["OWNER", "TENANT", "ADMIN"].includes(role)) {
    throw new Error("BAD_ROLE");
  }
  if (me.id === userId) throw new Error("CANNOT_MODIFY_SELF");

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export type ResetUserPasswordState = {
  error?: string;
  successPassword?: string;
};

export async function adminResetPassword(
  _prev: ResetUserPasswordState,
  formData: FormData
): Promise<ResetUserPasswordState> {
  const me = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const newPassword = String(formData.get("password") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };
  if (me.id === userId) return { error: "Tidak bisa mereset password sendiri di sini." };
  if (newPassword.length < 8) {
    return { error: "Password baru minimal 8 karakter." };
  }
  const { hashPassword } = await import("@/lib/password");
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  return { successPassword: newPassword };
}

export type ChangeOwnPasswordState = {
  error?: string;
  success?: boolean;
};

/**
 * Admin (atau siapapun yang login) mengganti password sendiri.
 * Mensyaratkan password lama untuk verifikasi — supaya kalau cookie
 * sesi dicuri, attacker tetap perlu password lama untuk lock-out user.
 */
export async function changeOwnPassword(
  _prev: ChangeOwnPasswordState,
  formData: FormData
): Promise<ChangeOwnPasswordState> {
  const me = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword) return { error: "Password lama wajib diisi." };
  if (newPassword.length < 8) {
    return { error: "Password baru minimal 8 karakter." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Konfirmasi password baru tidak cocok." };
  }
  if (newPassword === currentPassword) {
    return { error: "Password baru tidak boleh sama dengan password lama." };
  }

  const { verifyPassword, hashPassword } = await import("@/lib/password");
  const ok = await verifyPassword(currentPassword, me.passwordHash);
  if (!ok) return { error: "Password lama salah." };

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash },
  });
  return { success: true };
}
