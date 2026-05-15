"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { notify } from "@/lib/notify";

export type ComplaintSubmitState = { error?: string };

export async function submitComplaint(
  _prev: ComplaintSubmitState,
  formData: FormData
): Promise<ComplaintSubmitState> {
  const user = await requireUser();
  if (user.role !== "TENANT") return { error: "Hanya penghuni yang bisa membuat komplain." };

  const tenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, status: "ACTIVE" },
    include: { room: { include: { kos: true } } },
  });
  if (!tenancy) {
    return { error: "Anda belum di-assign ke kamar manapun." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (title.length < 3) return { error: "Judul komplain minimal 3 karakter." };
  if (description.length < 5) return { error: "Deskripsi minimal 5 karakter." };

  // Ambil semua file foto (maks 4)
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 4);

  const photoUrls: string[] = [];
  for (const f of files) {
    try {
      const url = await saveUploadedFile(f, `complaints/${tenancy.id}`);
      photoUrls.push(url);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Gagal unggah foto." };
    }
  }

  const complaint = await prisma.complaint.create({
    data: {
      tenancyId: tenancy.id,
      title,
      description,
      photoUrls: JSON.stringify(photoUrls),
    },
  });

  await notify({
    userId: tenancy.room.kos.ownerId,
    type: "COMPLAINT_NEW",
    title: "Komplain baru dari penghuni",
    message: `${user.name} membuat komplain: ${title}`,
    link: `/complaints/${complaint.id}`,
  });

  revalidatePath("/complaints");
  redirect(`/complaints/${complaint.id}`);
}

export type ReplyComplaintState = { error?: string; success?: string };

const MAX_RESOLUTION_PHOTOS = 6;

export async function replyComplaint(
  _prev: ReplyComplaintState,
  formData: FormData
): Promise<ReplyComplaintState> {
  const user = await requireUser();
  const complaintId = String(formData.get("complaintId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reply = String(formData.get("ownerReply") ?? "").trim() || null;

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: { tenancy: { include: { tenant: true, room: { include: { kos: true } } } } },
  });
  if (!complaint) return { error: "Komplain tidak ditemukan." };
  if (user.role !== "OWNER" || complaint.tenancy.room.kos.ownerId !== user.id) {
    return { error: "Anda tidak punya akses untuk membalas komplain ini." };
  }

  let newStatus: string = complaint.status;
  if (action === "IN_PROGRESS") newStatus = "IN_PROGRESS";
  else if (action === "RESOLVED") newStatus = "RESOLVED";
  else if (action === "REOPEN") newStatus = "OPEN";

  // File bukti dukung dari pemilik. Diakumulasi ke array yang sudah ada.
  const existing: string[] = complaint.resolutionPhotoUrls
    ? JSON.parse(complaint.resolutionPhotoUrls)
    : [];
  const files = formData
    .getAll("resolutionPhotos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_RESOLUTION_PHOTOS - existing.length);

  const newUrls: string[] = [];
  for (const f of files) {
    try {
      const url = await saveUploadedFile(f, `complaints/${complaint.tenancyId}/resolution`);
      newUrls.push(url);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Gagal unggah foto bukti." };
    }
  }

  const mergedUrls = [...existing, ...newUrls];

  await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      ownerReply: reply ?? complaint.ownerReply,
      status: newStatus,
      resolutionPhotoUrls:
        mergedUrls.length > 0 ? JSON.stringify(mergedUrls) : null,
      resolvedAt: newStatus === "RESOLVED" ? new Date() : null,
    },
  });

  if (newStatus !== complaint.status || reply || newUrls.length > 0) {
    const note =
      newUrls.length > 0
        ? ` (+${newUrls.length} foto bukti)`
        : "";
    await notify({
      userId: complaint.tenancy.tenantId,
      type: "COMPLAINT_UPDATE",
      title: "Update komplain Anda",
      message: `Status komplain "${complaint.title}" diubah menjadi ${labelStatus(newStatus)}${note}.`,
      link: `/complaints/${complaint.id}`,
    });
  }

  revalidatePath("/complaints");
  revalidatePath(`/complaints/${complaint.id}`);
  return {
    success:
      newUrls.length > 0
        ? `Balasan tersimpan (+${newUrls.length} foto bukti).`
        : "Balasan tersimpan.",
  };
}

export async function removeResolutionPhoto(formData: FormData) {
  const user = await requireUser();
  const complaintId = String(formData.get("complaintId") ?? "");
  const url = String(formData.get("url") ?? "");
  if (!complaintId || !url) return;

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: { tenancy: { include: { room: { include: { kos: true } } } } },
  });
  if (!complaint) return;
  if (user.role !== "OWNER" || complaint.tenancy.room.kos.ownerId !== user.id) {
    return;
  }

  const list: string[] = complaint.resolutionPhotoUrls
    ? JSON.parse(complaint.resolutionPhotoUrls)
    : [];
  const next = list.filter((u) => u !== url);
  await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      resolutionPhotoUrls: next.length > 0 ? JSON.stringify(next) : null,
    },
  });
  revalidatePath(`/complaints/${complaint.id}`);
}

function labelStatus(s: string) {
  if (s === "OPEN") return "Terbuka";
  if (s === "IN_PROGRESS") return "Dalam proses";
  return "Selesai";
}
