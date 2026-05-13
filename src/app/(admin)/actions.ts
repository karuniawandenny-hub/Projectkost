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

export async function approveOwner(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("BAD_INPUT");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("NOT_FOUND");
  if (target.role !== "OWNER") throw new Error("BAD_ROLE");

  await prisma.user.update({
    where: { id: target.id },
    data: { status: "ACTIVE" },
  });
  await notify({
    userId: target.id,
    type: "OWNER_APPROVED",
    title: "Akun pemilik Anda disetujui",
    message:
      "Selamat! Akun pemilik Anda telah disetujui. Silakan masuk untuk mulai mengelola kos.",
    link: "/login",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${target.id}`);
}

export async function rejectOwner(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("BAD_INPUT");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("NOT_FOUND");
  if (target.role !== "OWNER" || target.status !== "PENDING") {
    throw new Error("BAD_STATE");
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { status: "SUSPENDED" },
  });
  await notify({
    userId: target.id,
    type: "OWNER_REJECTED",
    title: "Pengajuan akun pemilik ditolak",
    message:
      "Mohon maaf, pengajuan akun pemilik Anda tidak disetujui. Silakan hubungi administrator untuk informasi lebih lanjut.",
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
