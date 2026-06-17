"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { notify } from "@/lib/notify";
import { sendWAWithTemplate } from "@/lib/wa-templates";
import { sendComplaintResolvedEmail } from "@/lib/email";
import { syncCorrectiveFromComplaint } from "../maintenance/actions";

function originFromHeaders(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

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

  // Sync ke record Maintenance korektif: kalau RESOLVED, bikin/update
  // record di tabel Maintenance supaya muncul di histori perawatan kamar.
  // Idempotent (cek complaintId unique di syncCorrectiveFromComplaint).
  if (newStatus === "RESOLVED") {
    try {
      await syncCorrectiveFromComplaint(complaint.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[complaint-resolved][maintenance-sync] gagal:", e);
    }
  }

  // === Notif WA + Email ke penghuni saat komplain BARU ditandai SELESAI ==
  // Hanya saat transisi (mencegah spam kalau pemilik re-save status yang
  // sudah RESOLVED). Best-effort: error WA/email tidak menggagalkan update.
  const tenant = complaint.tenancy.tenant;
  if (newStatus === "RESOLVED" && complaint.status !== "RESOLVED") {
    const finalReply = reply ?? complaint.ownerReply ?? null;
    const complaintUrl = `${originFromHeaders()}/complaints/${complaint.id}`;

    // --- WhatsApp ---
    if (tenant.phone) {
      const lines = [
        `Halo ${tenant.name},`,
        ``,
        `Komplain Anda sudah selesai ditangani oleh pemilik kos.`,
        ``,
        `Judul: ${complaint.title}`,
      ];
      if (finalReply) {
        lines.push(``, `Catatan pemilik:`, finalReply);
      }
      lines.push(
        ``,
        `Bila masih ada kendala atau perbaikan belum tuntas, silakan buka kembali komplain melalui aplikasi.`,
        ``,
        `-Asisten AI KosBaiti-`
      );
      try {
        await sendWAWithTemplate({
          phone: tenant.phone,
          text: lines.join("\n"),
          template: {
            name: "complaint_resolved",
            params: [
              tenant.name,
              complaint.title,
              finalReply ?? "(tidak ada catatan tambahan)",
            ],
          },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[complaint-resolved][wa] gagal:", e);
      }
    }

    // --- Email ---
    if (tenant.email) {
      try {
        const result = await sendComplaintResolvedEmail(tenant.email, {
          tenantName: tenant.name,
          complaintTitle: complaint.title,
          ownerReply: finalReply,
          complaintUrl,
        });
        if (!result.delivered) {
          // eslint-disable-next-line no-console
          console.error("[complaint-resolved][email] gagal:", result.error);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[complaint-resolved][email] gagal:", e);
      }
    }
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
