"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { saveUploadedFile, deleteUploadsByUrls } from "@/lib/upload";
import { notify } from "@/lib/notify";
import {
  nextScheduledDate,
  type MaintenanceStatus,
} from "@/lib/maintenance";

export type MaintActionState = { error?: string; success?: string };

async function requireOwnerOrAdmin() {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/**
 * Pastikan kos & (opsional) kamar milik OWNER pemanggil. ADMIN bebas.
 */
async function assertOwnsScope(
  userId: string,
  role: string,
  kosId: string,
  roomId: string | null
) {
  if (role === "ADMIN") return;
  const kos = await prisma.kos.findFirst({
    where: { id: kosId, ownerId: userId },
    select: { id: true },
  });
  if (!kos) throw new Error("FORBIDDEN_KOS");
  if (roomId) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, kosId },
      select: { id: true },
    });
    if (!room) throw new Error("FORBIDDEN_ROOM");
  }
}

/**
 * Buat record maintenance PREVENTIVE oleh pemilik.
 */
export async function createPreventive(
  _prev: MaintActionState,
  formData: FormData
): Promise<MaintActionState> {
  const me = await requireOwnerOrAdmin();

  const kosId = String(formData.get("kosId") ?? "");
  const roomIdRaw = String(formData.get("roomId") ?? "");
  const roomId = roomIdRaw === "" || roomIdRaw === "__none__" ? null : roomIdRaw;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const scheduledDateRaw = String(formData.get("scheduledDate") ?? "").trim();
  const recurrenceRaw = String(formData.get("recurrenceMonths") ?? "").trim();

  if (!kosId) return { error: "Pilih kos terlebih dahulu." };
  if (title.length < 3) return { error: "Judul minimal 3 karakter." };
  if (!scheduledDateRaw) return { error: "Tanggal jadwal wajib diisi." };
  const scheduledDate = new Date(scheduledDateRaw);
  if (isNaN(scheduledDate.getTime())) {
    return { error: "Format tanggal jadwal tidak valid." };
  }

  let recurrenceMonths: number | null = null;
  if (recurrenceRaw && recurrenceRaw !== "0") {
    const n = Number.parseInt(recurrenceRaw, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 60) {
      return { error: "Interval rekurensi tidak valid." };
    }
    recurrenceMonths = n;
  }

  try {
    await assertOwnsScope(me.id, me.role, kosId, roomId);
  } catch {
    return { error: "Anda tidak punya akses ke kos/kamar tersebut." };
  }

  await prisma.maintenance.create({
    data: {
      type: "PREVENTIVE",
      kosId,
      roomId,
      title,
      description,
      scheduledDate,
      recurrenceMonths,
      status: "SCHEDULED",
    },
  });

  revalidatePath("/maintenance");
  if (roomId) revalidatePath(`/kos/${kosId}`);
  redirect("/maintenance?created=1");
}

/**
 * Update status: SCHEDULED → IN_PROGRESS, atau cancel kapan saja.
 */
export async function setMaintenanceStatus(
  _prev: MaintActionState,
  formData: FormData
): Promise<MaintActionState> {
  const me = await requireOwnerOrAdmin();
  const id = String(formData.get("id") ?? "");
  const newStatus = String(formData.get("status") ?? "") as MaintenanceStatus;
  if (!["IN_PROGRESS", "CANCELLED"].includes(newStatus)) {
    return { error: "Status tidak valid untuk aksi ini." };
  }

  const m = await prisma.maintenance.findUnique({ where: { id } });
  if (!m) return { error: "Data perawatan tidak ditemukan." };
  try {
    await assertOwnsScope(me.id, me.role, m.kosId, m.roomId);
  } catch {
    return { error: "Anda tidak punya akses." };
  }
  if (m.status === "COMPLETED") {
    return { error: "Sudah selesai, tidak bisa diubah." };
  }

  await prisma.maintenance.update({
    where: { id },
    data: { status: newStatus },
  });

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${id}`);
  if (m.roomId) revalidatePath(`/kos/${m.kosId}`);
  return { success: `Status diubah ke ${newStatus}.` };
}

/**
 * Tandai SELESAI: isi tanggal selesai, biaya, vendor, catatan, foto.
 * Jika ada recurrenceMonths, otomatis bikin record berikutnya.
 */
export async function completeMaintenance(
  _prev: MaintActionState,
  formData: FormData
): Promise<MaintActionState> {
  const me = await requireOwnerOrAdmin();
  const id = String(formData.get("id") ?? "");
  const completedDateRaw = String(formData.get("completedDate") ?? "").trim();
  const costRaw = String(formData.get("cost") ?? "").trim();
  const vendor = String(formData.get("vendor") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const m = await prisma.maintenance.findUnique({ where: { id } });
  if (!m) return { error: "Data perawatan tidak ditemukan." };
  try {
    await assertOwnsScope(me.id, me.role, m.kosId, m.roomId);
  } catch {
    return { error: "Anda tidak punya akses." };
  }
  if (m.status === "COMPLETED") {
    return { error: "Sudah selesai sebelumnya." };
  }

  const completedDate = completedDateRaw
    ? new Date(completedDateRaw)
    : new Date();
  if (isNaN(completedDate.getTime())) {
    return { error: "Tanggal selesai tidak valid." };
  }

  let cost: number | null = null;
  if (costRaw) {
    const n = Number.parseInt(costRaw.replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > 0) cost = n;
  }

  // Foto bukti perbaikan (akumulasi ke array yang sudah ada).
  const existingPhotos: string[] = m.photoUrls
    ? JSON.parse(m.photoUrls)
    : [];
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 6 - existingPhotos.length);
  const newUrls: string[] = [];
  for (const f of files) {
    try {
      const url = await saveUploadedFile(f, `maintenance/${m.id}`);
      newUrls.push(url);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Gagal unggah foto." };
    }
  }
  const mergedPhotos = [...existingPhotos, ...newUrls];

  await prisma.maintenance.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedDate,
      cost,
      vendor,
      notes,
      photoUrls: mergedPhotos.length > 0 ? JSON.stringify(mergedPhotos) : null,
    },
  });

  // Auto-generate next occurrence kalau ini preventif berulang.
  if (m.type === "PREVENTIVE" && m.recurrenceMonths && m.recurrenceMonths > 0) {
    const next = nextScheduledDate(completedDate, m.recurrenceMonths);
    await prisma.maintenance.create({
      data: {
        type: "PREVENTIVE",
        kosId: m.kosId,
        roomId: m.roomId,
        title: m.title,
        description: m.description,
        scheduledDate: next,
        recurrenceMonths: m.recurrenceMonths,
        parentMaintenanceId: m.id,
        status: "SCHEDULED",
      },
    });
  }

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${id}`);
  if (m.roomId) revalidatePath(`/kos/${m.kosId}`);
  return { success: "Perawatan ditandai selesai." };
}

/**
 * Hapus record (kecuali CORRECTIVE yang otomatis dari komplain — itu
 * harus dihapus lewat komplain agar konsisten).
 */
export async function deleteMaintenance(
  _prev: MaintActionState,
  formData: FormData
): Promise<MaintActionState> {
  const me = await requireOwnerOrAdmin();
  const id = String(formData.get("id") ?? "");
  const m = await prisma.maintenance.findUnique({ where: { id } });
  if (!m) return { error: "Data tidak ditemukan." };
  try {
    await assertOwnsScope(me.id, me.role, m.kosId, m.roomId);
  } catch {
    return { error: "Anda tidak punya akses." };
  }
  if (m.type === "CORRECTIVE") {
    return {
      error:
        "Record korektif tidak bisa dihapus dari sini — datanya turunan komplain. Hapus/edit komplain terkait.",
    };
  }

  const photos: string[] = m.photoUrls ? JSON.parse(m.photoUrls) : [];
  await prisma.maintenance.delete({ where: { id } });
  await deleteUploadsByUrls(photos);

  revalidatePath("/maintenance");
  if (m.roomId) revalidatePath(`/kos/${m.kosId}`);
  return { success: "Perawatan dihapus." };
}

/**
 * Internal helper: dipanggil dari complaints/actions.ts saat status
 * komplain berubah ke RESOLVED. Bikin (atau update kalau sudah ada
 * link) record CORRECTIVE yang langsung berstatus COMPLETED.
 *
 * Tidak melakukan permission check karena dipanggil dari server action
 * lain yang sudah validasi pemilik kos.
 */
export async function syncCorrectiveFromComplaint(complaintId: string) {
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: {
      tenancy: {
        include: { room: { include: { kos: true } } },
      },
    },
  });
  if (!complaint) return;
  if (complaint.status !== "RESOLVED") return;

  const existing = await prisma.maintenance.findUnique({
    where: { complaintId },
  });

  const photos: string[] = [];
  try {
    const a = complaint.photoUrls ? JSON.parse(complaint.photoUrls) : [];
    const b = complaint.resolutionPhotoUrls
      ? JSON.parse(complaint.resolutionPhotoUrls)
      : [];
    for (const u of [...a, ...b]) {
      if (typeof u === "string") photos.push(u);
    }
  } catch {
    // ignore parse error
  }

  const data = {
    type: "CORRECTIVE",
    kosId: complaint.tenancy.room.kos.id,
    roomId: complaint.tenancy.room.id,
    title: complaint.title,
    description: complaint.description,
    status: "COMPLETED",
    scheduledDate: complaint.createdAt,
    completedDate: complaint.resolvedAt ?? new Date(),
    notes: complaint.ownerReply,
    photoUrls: photos.length > 0 ? JSON.stringify(photos) : null,
    complaintId: complaint.id,
  } as const;

  if (existing) {
    await prisma.maintenance.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        description: data.description,
        notes: data.notes,
        completedDate: data.completedDate,
        photoUrls: data.photoUrls,
      },
    });
  } else {
    await prisma.maintenance.create({ data });
  }
}
