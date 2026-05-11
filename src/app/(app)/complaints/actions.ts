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

export async function replyComplaint(formData: FormData) {
  const user = await requireUser();
  const complaintId = String(formData.get("complaintId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reply = String(formData.get("ownerReply") ?? "").trim() || null;

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: { tenancy: { include: { tenant: true, room: { include: { kos: true } } } } },
  });
  if (!complaint) throw new Error("NOT_FOUND");
  // Hanya owner kos terkait yang boleh.
  if (user.role !== "OWNER" || complaint.tenancy.room.kos.ownerId !== user.id) {
    throw new Error("FORBIDDEN");
  }

  let newStatus: string = complaint.status;
  if (action === "IN_PROGRESS") newStatus = "IN_PROGRESS";
  else if (action === "RESOLVED") newStatus = "RESOLVED";
  else if (action === "REOPEN") newStatus = "OPEN";

  await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      ownerReply: reply ?? complaint.ownerReply,
      status: newStatus,
      resolvedAt: newStatus === "RESOLVED" ? new Date() : null,
    },
  });

  if (newStatus !== complaint.status || reply) {
    await notify({
      userId: complaint.tenancy.tenantId,
      type: "COMPLAINT_UPDATE",
      title: "Update komplain Anda",
      message: `Status komplain "${complaint.title}" diubah menjadi ${labelStatus(newStatus)}.`,
      link: `/complaints/${complaint.id}`,
    });
  }

  revalidatePath("/complaints");
  revalidatePath(`/complaints/${complaint.id}`);
}

function labelStatus(s: string) {
  if (s === "OPEN") return "Terbuka";
  if (s === "IN_PROGRESS") return "Dalam proses";
  return "Selesai";
}
