"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendTenantAssignedEmail, buildTenantAssignedText } from "@/lib/email";
import { sendWhatsAppGeneric } from "@/lib/reminders";

function originFromHeaders(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export type KosState = { error?: string };

export async function createKos(
  _prev: KosState,
  formData: FormData
): Promise<KosState> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Hanya pemilik yang bisa menambah kos." };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (name.length < 2) return { error: "Nama kos wajib diisi." };
  if (address.length < 5) return { error: "Alamat tidak valid." };

  await prisma.kos.create({
    data: { ownerId: user.id, name, address, description },
  });
  revalidatePath("/kos");
  redirect("/kos");
}

export type UpdateKosState = { error?: string; success?: boolean };

export async function updateKos(
  _prev: UpdateKosState,
  formData: FormData
): Promise<UpdateKosState> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Hanya pemilik yang bisa mengubah kos." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!id) return { error: "ID kos tidak ditemukan." };
  if (name.length < 2) return { error: "Nama kos wajib diisi." };
  if (address.length < 5) return { error: "Alamat tidak valid." };

  const kos = await prisma.kos.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true },
  });
  if (!kos) return { error: "Kos tidak ditemukan." };

  await prisma.kos.update({
    where: { id },
    data: { name, address, description },
  });
  revalidatePath(`/kos/${id}`);
  revalidatePath("/kos");
  return { success: true };
}

export type RoomState = { error?: string };

export async function createRoom(
  _prev: RoomState,
  formData: FormData
): Promise<RoomState> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Hanya pemilik yang bisa menambah kamar." };

  const kosId = String(formData.get("kosId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const priceRaw = String(formData.get("monthlyPrice") ?? "");
  const monthlyPrice = parseInt(priceRaw.replace(/\D/g, ""), 10);

  const kos = await prisma.kos.findFirst({ where: { id: kosId, ownerId: user.id } });
  if (!kos) return { error: "Kos tidak ditemukan." };
  if (name.length < 1) return { error: "Nama/nomor kamar wajib diisi." };
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
    return { error: "Harga bulanan tidak valid." };
  }

  await prisma.room.create({ data: { kosId, name, monthlyPrice } });
  revalidatePath(`/kos/${kosId}`);
  return {};
}

export type UpdateRoomState = { error?: string; success?: boolean };

export async function updateRoom(
  _prev: UpdateRoomState,
  formData: FormData
): Promise<UpdateRoomState> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Hanya pemilik yang bisa mengubah kamar." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const priceRaw = String(formData.get("monthlyPrice") ?? "");
  const monthlyPrice = parseInt(priceRaw.replace(/\D/g, ""), 10);

  if (!id) return { error: "ID kamar tidak ditemukan." };
  if (name.length < 1) return { error: "Nama/nomor kamar wajib diisi." };
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
    return { error: "Harga bulanan tidak valid." };
  }

  const room = await prisma.room.findFirst({
    where: { id, kos: { ownerId: user.id } },
    select: { id: true, kosId: true },
  });
  if (!room) return { error: "Kamar tidak ditemukan." };

  await prisma.room.update({
    where: { id },
    data: { name, monthlyPrice },
  });
  revalidatePath(`/kos/${room.kosId}`);
  return { success: true };
}

export type AssignState = { error?: string; success?: string };

export async function assignTenant(
  _prev: AssignState,
  formData: FormData
): Promise<AssignState> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Tidak diizinkan." };

  const roomId = String(formData.get("roomId") ?? "");
  const tenantId = String(formData.get("tenantId") ?? "");
  const startDateRaw = String(formData.get("startDate") ?? "").trim();
  if (!tenantId) return { error: "Pilih penghuni terlebih dahulu." };

  let startDate = new Date();
  if (startDateRaw) {
    const parsed = new Date(startDateRaw);
    if (isNaN(parsed.getTime())) {
      return { error: "Format tanggal mulai tidak valid." };
    }
    startDate = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    );
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, kos: { ownerId: user.id } },
    include: { kos: { select: { name: true } } },
  });
  if (!room) return { error: "Kamar tidak ditemukan." };
  if (room.status === "OCCUPIED") return { error: "Kamar sudah terisi." };

  const tenant = await prisma.user.findUnique({ where: { id: tenantId } });
  if (!tenant) return { error: "Penghuni tidak ditemukan." };
  if (tenant.role !== "TENANT") {
    return { error: "Akun yang dipilih bukan penghuni." };
  }
  if (tenant.status !== "ACTIVE") {
    return { error: "Akun penghuni belum aktif (masih menunggu approval)." };
  }

  const active = await prisma.tenancy.findFirst({
    where: { tenantId: tenant.id, status: "ACTIVE" },
  });
  if (active) {
    return { error: "Penghuni sudah punya tenancy aktif. Akhiri dulu sebelumnya." };
  }

  await prisma.$transaction([
    prisma.tenancy.create({
      data: { tenantId: tenant.id, roomId: room.id, startDate },
    }),
    prisma.room.update({ where: { id: room.id }, data: { status: "OCCUPIED" } }),
    prisma.notification.create({
      data: {
        userId: tenant.id,
        type: "TENANCY_ASSIGNED",
        title: "Anda di-assign ke kamar baru",
        message: `Anda di-assign ke ${room.kos.name} - Kamar ${room.name}. Mulai sewa: ${startDate.toLocaleDateString(
          "id-ID",
          { day: "2-digit", month: "long", year: "numeric" }
        )}.`,
        link: "/dashboard",
      },
    }),
  ]);

  // Kirim welcome email + WA — non-blocking, gagal kirim tidak membatalkan
  // assignment. Kedua channel independen.
  const welcomeParams = {
    tenantName: tenant.name,
    kosName: room.kos.name,
    roomName: room.name,
    startDate,
    monthlyPrice: room.monthlyPrice,
    loginUrl: `${originFromHeaders()}/login`,
  };
  if (tenant.email) {
    const result = await sendTenantAssignedEmail(tenant.email, welcomeParams);
    if (!result.delivered) {
      // eslint-disable-next-line no-console
      console.error("[assignTenantToRoom] welcome email gagal:", result.error);
    }
  }
  if (tenant.phone) {
    try {
      await sendWhatsAppGeneric(tenant.phone, buildTenantAssignedText(welcomeParams));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[assignTenantToRoom] welcome WA gagal:", e);
    }
  }

  revalidatePath(`/kos`);
  revalidatePath(`/kos/${room.kosId}`);
  revalidatePath(`/tenants`);
  return { success: `${tenant.name} di-assign ke kamar ${room.name}.` };
}

export async function endTenancy(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("FORBIDDEN");
  const tenancyId = String(formData.get("tenancyId") ?? "");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, room: { kos: { ownerId: user.id } } },
    include: { room: true },
  });
  if (!tenancy) throw new Error("NOT_FOUND");

  await prisma.$transaction([
    prisma.tenancy.update({
      where: { id: tenancy.id },
      data: { status: "ENDED", endDate: new Date() },
    }),
    prisma.room.update({
      where: { id: tenancy.roomId },
      data: { status: "AVAILABLE" },
    }),
  ]);
  revalidatePath("/tenants");
  revalidatePath("/kos");
}
