"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notify } from "@/lib/notify";
import { normalizeEmail, isValidEmail } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { logAudit } from "@/lib/audit";

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
  // TENANT wajib sudah upload KTP + selfie sebelum boleh diaktifkan.
  // Admin bisa upload atas nama tenant dari /admin/users/[id] kalau perlu.
  if (
    target.role === "TENANT" &&
    (!target.ktpPhotoUrl || !target.selfiePhotoUrl)
  ) {
    throw new Error("DOCS_INCOMPLETE");
  }

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
 * Bulk approve banyak user PENDING sekaligus. Pakai dari halaman
 * /admin/users dengan checkbox + tombol "Setujui semua".
 * userIds dipisahkan oleh koma.
 */
export async function bulkApproveUsers(formData: FormData) {
  await requireAdmin();
  const idsRaw = String(formData.get("userIds") ?? "");
  const userIds = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (userIds.length === 0) throw new Error("BAD_INPUT");

  const targets = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      status: "PENDING",
      role: { in: ["OWNER", "TENANT"] },
    },
  });

  // Skip TENANT yang belum lengkapi KTP + selfie — mereka tidak bisa
  // di-approve dari bulk action ini. Admin harus buka detail user &
  // upload dulu (atau minta tenant upload sendiri).
  const skipped: string[] = [];
  for (const target of targets) {
    if (
      target.role === "TENANT" &&
      (!target.ktpPhotoUrl || !target.selfiePhotoUrl)
    ) {
      skipped.push(target.name);
      continue;
    }
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
  }

  if (skipped.length > 0) {
    // Best-effort: kasih tahu admin lewat log. UI batch tidak punya jalur
    // error UI yang jelas jadi log ini yang dipakai untuk debugging.
    // eslint-disable-next-line no-console
    console.warn(
      `[bulkApproveUsers] ${skipped.length} tenant di-skip karena KTP/selfie belum lengkap: ${skipped.join(", ")}`
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

/**
 * Bulk reject banyak user PENDING sekaligus.
 */
export async function bulkRejectUsers(formData: FormData) {
  await requireAdmin();
  const idsRaw = String(formData.get("userIds") ?? "");
  const userIds = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (userIds.length === 0) throw new Error("BAD_INPUT");

  const targets = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      status: "PENDING",
      role: { in: ["OWNER", "TENANT"] },
    },
  });

  for (const target of targets) {
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
  }

  revalidatePath("/admin/users");
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

export type UpdateProfileState = { error?: string; success?: string };

/**
 * Admin update profil user manapun: name, email, phone, username.
 * Email & username di-cek unique. Phone otomatis di-normalize.
 * Field yang di-submit kosong akan di-skip (jangan reset field lain
 * yang tidak dimaksud). Untuk clear username, kirim string "-" atau
 * kosongkan tapi centang opsi khusus (di UI diberi tombol terpisah).
 */
export async function updateUserProfile(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const me = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User tidak ditemukan." };

  const nameRaw = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const usernameRaw = String(formData.get("username") ?? "").trim();

  const updates: {
    name?: string;
    email?: string;
    phone?: string | null;
    username?: string | null;
  } = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (nameRaw && nameRaw !== target.name) {
    if (nameRaw.length < 2) return { error: "Nama minimal 2 karakter." };
    updates.name = nameRaw;
    changes.name = { from: target.name, to: nameRaw };
  }

  if (emailRaw) {
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) return { error: "Format email tidak valid." };
    if (email !== target.email) {
      const conflict = await prisma.user.findUnique({ where: { email } });
      if (conflict && conflict.id !== target.id) {
        return { error: `Email ${email} sudah dipakai user lain.` };
      }
      updates.email = email;
      changes.email = { from: target.email, to: email };
    }
  }

  if (phoneRaw) {
    const norm = normalizePhone(phoneRaw);
    if (!norm) {
      return { error: "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx." };
    }
    if (norm !== target.phone) {
      updates.phone = norm;
      changes.phone = { from: target.phone, to: norm };
    }
  }

  if (usernameRaw) {
    // "-" adalah sentinel untuk "hapus username" (biarkan null).
    if (usernameRaw === "-") {
      if (target.username !== null) {
        updates.username = null;
        changes.username = { from: target.username, to: null };
      }
    } else if (usernameRaw !== target.username) {
      if (usernameRaw.length < 3) {
        return { error: "Username minimal 3 karakter (atau '-' untuk hapus)." };
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(usernameRaw)) {
        return {
          error:
            "Username hanya boleh huruf, angka, titik, dash, atau underscore.",
        };
      }
      const conflict = await prisma.user.findUnique({
        where: { username: usernameRaw },
      });
      if (conflict && conflict.id !== target.id) {
        return { error: `Username ${usernameRaw} sudah dipakai user lain.` };
      }
      updates.username = usernameRaw;
      changes.username = { from: target.username, to: usernameRaw };
    }
  }

  if (Object.keys(updates).length === 0) {
    return { error: "Tidak ada perubahan yang perlu disimpan." };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: updates,
  });

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.APPROVE",
    entityType: "User",
    entityId: target.id,
    metadata: {
      subAction: "UPDATE_PROFILE",
      targetName: target.name,
      changes,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${target.id}`);
  return {
    success: `Profil ${target.name} berhasil diperbarui (${Object.keys(changes).join(", ")}).`,
  };
}
