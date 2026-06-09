"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notify } from "@/lib/notify";
import { sendEmailGeneric } from "@/lib/reminders";
import { logAudit } from "@/lib/audit";

export type AnnouncementState = { error?: string; success?: string };

async function requireOwnerOrAdmin() {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/**
 * Kirim pengumuman broadcast ke seluruh penghuni aktif.
 *
 * Scope (kosId):
 *  - kosId tertentu  : hanya penghuni kos itu (wajib milik owner).
 *  - "__all__" / ""  : semua kos milik owner (admin: semua kos sistem).
 *
 * Pengiriman per penghuni: in-app (otomatis memicu Web Push) + email
 * opsional. Dedupe per tenant (1 orang bisa sewa >1 kamar).
 */
export async function createAnnouncement(
  _prev: AnnouncementState,
  formData: FormData
): Promise<AnnouncementState> {
  const me = await requireOwnerOrAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const kosIdRaw = String(formData.get("kosId") ?? "").trim();
  const alsoEmail = formData.get("alsoEmail") === "on";
  const kosId = kosIdRaw === "" || kosIdRaw === "__all__" ? null : kosIdRaw;

  if (title.length < 3) return { error: "Judul minimal 3 karakter." };
  if (body.length < 5) return { error: "Isi pengumuman minimal 5 karakter." };

  // Validasi kepemilikan kos kalau owner memilih kos spesifik.
  if (kosId && me.role === "OWNER") {
    const owns = await prisma.kos.findFirst({
      where: { id: kosId, ownerId: me.id },
      select: { id: true },
    });
    if (!owns) return { error: "Anda tidak punya akses ke kos tersebut." };
  }

  // Kumpulkan penghuni aktif sesuai scope.
  const tenancyWhere: Record<string, unknown> = { status: "ACTIVE" };
  if (kosId) {
    tenancyWhere.room = { kosId };
  } else if (me.role === "OWNER") {
    tenancyWhere.room = { kos: { ownerId: me.id } };
  }
  // ADMIN + tanpa kosId → semua kos sistem (tenancyWhere tanpa filter kos).

  const tenancies = await prisma.tenancy.findMany({
    where: tenancyWhere,
    select: {
      tenant: { select: { id: true, name: true, email: true } },
    },
  });

  // Dedupe per tenant.
  const tenants = new Map<string, { id: string; name: string; email: string | null }>();
  for (const t of tenancies) tenants.set(t.tenant.id, t.tenant);

  if (tenants.size === 0) {
    return { error: "Tidak ada penghuni aktif pada scope yang dipilih." };
  }

  const announcement = await prisma.announcement.create({
    data: {
      authorId: me.id,
      kosId,
      title,
      body,
      audienceCount: tenants.size,
    },
  });

  // Fan-out. Best-effort per channel — kegagalan 1 penghuni tidak
  // menggagalkan keseluruhan.
  for (const tenant of tenants.values()) {
    try {
      await notify({
        userId: tenant.id,
        type: "ANNOUNCEMENT",
        title: `📣 ${title}`,
        message: body,
        link: "/announcements",
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[announcement][notify]", tenant.id, e);
    }
    if (alsoEmail && tenant.email) {
      try {
        await sendEmailGeneric(tenant.email, `📣 ${title}`, body);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[announcement][email]", tenant.id, e);
      }
    }
  }

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "ANNOUNCEMENT.SEND",
    entityType: "Announcement",
    entityId: announcement.id,
    metadata: {
      title,
      kosId,
      audienceCount: announcement.audienceCount,
      alsoEmail,
    },
  });

  revalidatePath("/announcements");
  return {
    success: `Pengumuman terkirim ke ${announcement.audienceCount} penghuni.`,
  };
}
