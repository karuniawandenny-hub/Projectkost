"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notify } from "@/lib/notify";

export type ApproveTenantState = { error?: string; success?: string };

async function requireOwnerOrAdmin() {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/**
 * Setujui penghuni saja (tanpa assign ke kamar) — sekedar mengubah
 * status PENDING -> ACTIVE.
 */
export async function approveTenant(
  _prev: ApproveTenantState,
  formData: FormData
): Promise<ApproveTenantState> {
  const me = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User tidak ditemukan." };
  if (target.role !== "TENANT") return { error: "Bukan akun penghuni." };
  if (target.status === "ACTIVE") return { error: "Sudah disetujui." };

  await prisma.user.update({
    where: { id: target.id },
    data: { status: "ACTIVE" },
  });

  await notify({
    userId: target.id,
    type: "TENANT_APPROVED",
    title: "Akun penghuni Anda disetujui",
    message: `${me.name} telah menyetujui akun Anda. Silakan login dan akses dashboard.`,
    link: "/dashboard",
  });

  revalidatePath("/tenants");
  revalidatePath("/tenants/pending");
  revalidatePath("/admin/users");
  return { success: `${target.name} disetujui.` };
}

/**
 * Setujui penghuni DAN langsung assign ke kamar pilihan owner. Akan
 * mengubah status PENDING -> ACTIVE, membuat Tenancy aktif, dan menandai
 * kamar OCCUPIED — semuanya dalam satu transaksi.
 */
export async function approveAndAssignTenant(
  _prev: ApproveTenantState,
  formData: FormData
): Promise<ApproveTenantState> {
  const me = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };
  if (!roomId) return { error: "Pilih kamar terlebih dahulu." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User tidak ditemukan." };
  if (target.role !== "TENANT") return { error: "Bukan akun penghuni." };

  // Cek kepemilikan kamar:
  // - OWNER hanya boleh assign ke kamar yang dia miliki.
  // - ADMIN boleh assign ke kamar manapun.
  const room = await prisma.room.findFirst({
    where:
      me.role === "OWNER"
        ? { id: roomId, kos: { ownerId: me.id } }
        : { id: roomId },
    include: { kos: { select: { name: true, ownerId: true } } },
  });
  if (!room) return { error: "Kamar tidak ditemukan / bukan milik Anda." };
  if (room.status === "OCCUPIED") return { error: "Kamar sudah terisi." };

  const activeTenancy = await prisma.tenancy.findFirst({
    where: { tenantId: target.id, status: "ACTIVE" },
  });
  if (activeTenancy) {
    return { error: "Penghuni sudah punya tenancy aktif." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { status: "ACTIVE" },
    }),
    prisma.tenancy.create({
      data: { tenantId: target.id, roomId: room.id },
    }),
    prisma.room.update({
      where: { id: room.id },
      data: { status: "OCCUPIED" },
    }),
  ]);

  await notify({
    userId: target.id,
    type: "TENANT_APPROVED_ASSIGNED",
    title: "Akun disetujui & kamar di-assign",
    message: `${me.name} menyetujui akun Anda dan menempatkan Anda di ${room.kos.name} - Kamar ${room.name}.`,
    link: "/dashboard",
  });

  revalidatePath("/tenants");
  revalidatePath("/tenants/pending");
  revalidatePath(`/kos/${room.kosId}`);
  revalidatePath("/kos");
  revalidatePath("/admin/users");
  return { success: `${target.name} disetujui & ditempatkan di kamar ${room.name}.` };
}

/**
 * Tolak pengajuan penghuni (status PENDING -> SUSPENDED).
 */
export async function rejectTenant(
  _prev: ApproveTenantState,
  formData: FormData
): Promise<ApproveTenantState> {
  await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "TENANT" || target.status !== "PENDING") {
    return { error: "User tidak valid untuk ditolak." };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { status: "SUSPENDED" },
  });
  await notify({
    userId: target.id,
    type: "TENANT_REJECTED",
    title: "Pengajuan akun ditolak",
    message:
      "Mohon maaf, pengajuan akun penghuni Anda tidak disetujui. Silakan hubungi administrator / pemilik kos.",
    link: "/login",
  });
  revalidatePath("/tenants/pending");
  revalidatePath("/admin/users");
  return { success: `${target.name} ditolak.` };
}
