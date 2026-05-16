"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notify } from "@/lib/notify";

export type MoveRequestState = { error?: string; success?: string };

/**
 * Penghuni mengajukan pindah kamar dalam KOS yang sama.
 * Validasi:
 *  - User adalah TENANT
 *  - Punya tenancy aktif
 *  - toRoom kosong dan berada di kos yang sama dengan tenancy aktif
 *  - Belum ada permintaan pindah PENDING dari tenancy ini
 */
export async function requestMove(
  _prev: MoveRequestState,
  formData: FormData
): Promise<MoveRequestState> {
  const user = await requireUser();
  if (user.role !== "TENANT") {
    return { error: "Hanya penghuni yang bisa mengajukan pindah kamar." };
  }
  const toRoomId = String(formData.get("toRoomId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!toRoomId) return { error: "Pilih kamar tujuan terlebih dahulu." };

  const tenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, status: "ACTIVE" },
    include: { room: { include: { kos: true } } },
  });
  if (!tenancy) {
    return { error: "Anda belum di-assign ke kamar manapun." };
  }
  if (tenancy.roomId === toRoomId) {
    return { error: "Kamar tujuan sama dengan kamar saat ini." };
  }

  const target = await prisma.room.findUnique({
    where: { id: toRoomId },
    include: { kos: { select: { id: true, name: true, ownerId: true } } },
  });
  if (!target) return { error: "Kamar tujuan tidak ditemukan." };
  if (target.kos.id !== tenancy.room.kos.id) {
    return { error: "Pindah hanya bisa ke kamar di kos yang sama." };
  }
  if (target.status !== "AVAILABLE") {
    return { error: "Kamar tujuan sudah tidak kosong." };
  }

  const existing = await prisma.roomMoveRequest.findFirst({
    where: { tenancyId: tenancy.id, status: "PENDING" },
  });
  if (existing) {
    return {
      error:
        "Anda sudah punya permintaan pindah yang masih menunggu. Batalkan dulu sebelum mengajukan baru.",
    };
  }

  const req = await prisma.roomMoveRequest.create({
    data: {
      tenancyId: tenancy.id,
      fromRoomId: tenancy.roomId,
      toRoomId: target.id,
      reason,
    },
  });

  await notify({
    userId: target.kos.ownerId,
    type: "MOVE_REQUEST",
    title: "Permintaan pindah kamar",
    message: `${user.name} ingin pindah dari kamar ${tenancy.room.name} ke kamar ${target.name} (${target.kos.name}).`,
    link: "/tenants",
  });

  revalidatePath("/move-request");
  revalidatePath("/tenants");
  return {
    success: `Permintaan pindah ke kamar ${target.name} telah dikirim ke pemilik (${req.id.slice(0, 8)}).`,
  };
}

/**
 * Penghuni membatalkan permintaan pindah yang masih PENDING.
 */
export async function cancelMoveRequest(formData: FormData) {
  const user = await requireUser();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return;
  const req = await prisma.roomMoveRequest.findUnique({
    where: { id: requestId },
    include: { tenancy: true },
  });
  if (!req) return;
  if (req.tenancy.tenantId !== user.id) return;
  if (req.status !== "PENDING") return;

  await prisma.roomMoveRequest.update({
    where: { id: req.id },
    data: { status: "REJECTED", ownerNote: "Dibatalkan oleh penghuni", decidedAt: new Date() },
  });
  revalidatePath("/move-request");
  revalidatePath("/tenants");
}

/**
 * Pemilik menyetujui permintaan pindah. Transaksi:
 *  - Akhiri tenancy lama (endDate = now, status = ENDED)
 *  - Kamar lama -> AVAILABLE
 *  - Buat tenancy baru pada kamar tujuan
 *  - Kamar tujuan -> OCCUPIED
 *  - Tandai request APPROVED
 */
export async function approveMoveRequest(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) throw new Error("BAD_INPUT");

  const req = await prisma.roomMoveRequest.findUnique({
    where: { id: requestId },
    include: {
      tenancy: { include: { tenant: true } },
      fromRoom: { include: { kos: true } },
      toRoom: { include: { kos: true } },
    },
  });
  if (!req) throw new Error("NOT_FOUND");
  if (req.status !== "PENDING") throw new Error("ALREADY_DECIDED");

  // OWNER hanya boleh approve di kos miliknya.
  if (user.role === "OWNER" && req.toRoom.kos.ownerId !== user.id) {
    throw new Error("FORBIDDEN");
  }

  // Validasi ulang state saat approve (race condition guard).
  const toRoom = await prisma.room.findUnique({ where: { id: req.toRoomId } });
  if (!toRoom || toRoom.status !== "AVAILABLE") {
    await prisma.roomMoveRequest.update({
      where: { id: req.id },
      data: {
        status: "REJECTED",
        ownerNote: "Otomatis ditolak: kamar tujuan sudah terisi.",
        decidedAt: new Date(),
      },
    });
    await notify({
      userId: req.tenancy.tenantId,
      type: "MOVE_REJECTED",
      title: "Permintaan pindah tidak bisa disetujui",
      message: `Kamar ${req.toRoom.name} sudah terisi pihak lain. Silakan pilih kamar lain.`,
      link: "/move-request",
    });
    revalidatePath("/move-request");
    revalidatePath("/tenants");
    return;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.tenancy.update({
      where: { id: req.tenancyId },
      data: { status: "ENDED", endDate: now },
    }),
    prisma.room.update({
      where: { id: req.fromRoomId },
      data: { status: "AVAILABLE" },
    }),
    prisma.tenancy.create({
      data: {
        tenantId: req.tenancy.tenantId,
        roomId: req.toRoomId,
        startDate: now,
      },
    }),
    prisma.room.update({
      where: { id: req.toRoomId },
      data: { status: "OCCUPIED" },
    }),
    prisma.roomMoveRequest.update({
      where: { id: req.id },
      data: { status: "APPROVED", decidedAt: now },
    }),
  ]);

  await notify({
    userId: req.tenancy.tenantId,
    type: "MOVE_APPROVED",
    title: "Permintaan pindah disetujui",
    message: `Anda kini menempati kamar ${req.toRoom.name} di ${req.toRoom.kos.name}.`,
    link: "/dashboard",
  });

  revalidatePath("/dashboard");
  revalidatePath("/move-request");
  revalidatePath("/tenants");
  revalidatePath("/kos");
  revalidatePath(`/kos/${req.fromRoom.kosId}`);
}

/**
 * Pemilik menolak permintaan pindah dengan catatan opsional.
 */
export async function rejectMoveRequest(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  const requestId = String(formData.get("requestId") ?? "");
  const note = String(formData.get("ownerNote") ?? "").trim() || null;
  if (!requestId) throw new Error("BAD_INPUT");

  const req = await prisma.roomMoveRequest.findUnique({
    where: { id: requestId },
    include: {
      tenancy: { include: { tenant: true } },
      toRoom: { include: { kos: true } },
    },
  });
  if (!req) throw new Error("NOT_FOUND");
  if (req.status !== "PENDING") throw new Error("ALREADY_DECIDED");
  if (user.role === "OWNER" && req.toRoom.kos.ownerId !== user.id) {
    throw new Error("FORBIDDEN");
  }

  await prisma.roomMoveRequest.update({
    where: { id: req.id },
    data: { status: "REJECTED", ownerNote: note, decidedAt: new Date() },
  });

  await notify({
    userId: req.tenancy.tenantId,
    type: "MOVE_REJECTED",
    title: "Permintaan pindah ditolak",
    message: note
      ? `Pemilik menolak permintaan pindah Anda: ${note}`
      : `Pemilik menolak permintaan pindah Anda.`,
    link: "/move-request",
  });
  revalidatePath("/move-request");
  revalidatePath("/tenants");
}
