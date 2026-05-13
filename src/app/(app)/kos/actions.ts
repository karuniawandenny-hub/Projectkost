"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

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

export type AssignState = { error?: string };

export async function assignTenant(
  _prev: AssignState,
  formData: FormData
): Promise<AssignState> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Tidak diizinkan." };

  const roomId = String(formData.get("roomId") ?? "");
  const tenantEmailRaw = String(formData.get("tenantEmail") ?? "");

  const room = await prisma.room.findFirst({
    where: { id: roomId, kos: { ownerId: user.id } },
  });
  if (!room) return { error: "Kamar tidak ditemukan." };
  if (room.status === "OCCUPIED") return { error: "Kamar sudah terisi." };

  const { normalizeEmail, isValidEmail } = await import("@/lib/password");
  const email = normalizeEmail(tenantEmailRaw);
  if (!isValidEmail(email)) return { error: "Email penghuni tidak valid." };

  const tenant = await prisma.user.findUnique({ where: { email } });
  if (!tenant) {
    return {
      error:
        "Penghuni dengan email tersebut belum terdaftar. Minta mereka daftar terlebih dahulu.",
    };
  }
  if (tenant.role !== "TENANT") {
    return { error: "Email tersebut bukan akun penghuni." };
  }

  const active = await prisma.tenancy.findFirst({
    where: { tenantId: tenant.id, status: "ACTIVE" },
  });
  if (active) {
    return { error: "Penghuni masih punya tenancy aktif. Akhiri dulu sebelumnya." };
  }

  await prisma.$transaction([
    prisma.tenancy.create({
      data: { tenantId: tenant.id, roomId: room.id },
    }),
    prisma.room.update({ where: { id: room.id }, data: { status: "OCCUPIED" } }),
    prisma.notification.create({
      data: {
        userId: tenant.id,
        type: "TENANCY_ASSIGNED",
        title: "Anda diassign ke kamar baru",
        message: `Anda di-assign ke kamar ${room.name}.`,
        link: "/dashboard",
      },
    }),
  ]);

  revalidatePath(`/kos`);
  revalidatePath(`/tenants`);
  return {};
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
