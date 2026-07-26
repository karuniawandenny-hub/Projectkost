"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { notify } from "@/lib/notify";
import { sendEmailGeneric } from "@/lib/reminders";
import { logAudit } from "@/lib/audit";

export type AnnouncementState = { error?: string; success?: string };

async function requireOwnerOrAdmin() {
  const user = await requireUser();
  if (!canManageKos(user) && user.role !== "ADMIN") {
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
  if (kosId && canManageKos(me)) {
    const owns = await prisma.kos.findFirst({
      where: { id: kosId, ownerId: getEffectiveOwnerId(me) },
      select: { id: true },
    });
    if (!owns) return { error: "Anda tidak punya akses ke kos tersebut." };
  }

  // Kumpulkan penghuni aktif sesuai scope.
  const tenancyWhere: Record<string, unknown> = { status: "ACTIVE" };
  if (kosId) {
    tenancyWhere.room = { kosId };
  } else if (canManageKos(me)) {
    tenancyWhere.room = { kos: { ownerId: getEffectiveOwnerId(me) } };
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

export type DeleteAnnouncementState = { error?: string; success?: string };

/**
 * Hapus pengumuman yang sudah pernah dikirim.
 *
 * Otorisasi:
 *  - OWNER: hanya bisa hapus pengumuman yang dia sendiri buat (authorId).
 *  - ADMIN: bisa hapus pengumuman siapa saja.
 *
 * Efek samping penting: notifikasi in-app terkait (type="ANNOUNCEMENT")
 * yang sudah dikirim ke penghuni TIDAK ikut terhapus. Alasan:
 *   - Riwayat notifikasi user adalah "log lonceng" yang independen —
 *     kalau penghuni sudah membaca notifikasi lalu owner menghapus,
 *     entri di lonceng akan tetap ada sebagai bukti pernah dikirim.
 *   - Notification.link akan mengarah ke /announcements yang sekarang
 *     tidak lagi menampilkan pengumuman ini — perilaku benar (tidak
 *     ada 404 karena link mengarah ke halaman list, bukan detail).
 */
export async function deleteAnnouncement(
  _prev: DeleteAnnouncementState,
  formData: FormData
): Promise<DeleteAnnouncementState> {
  const me = await requireOwnerOrAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "ID pengumuman tidak valid." };

  // Scope hard-check: OWNER hanya bisa akses miliknya sendiri.
  const where =
    me.role === "ADMIN" ? { id } : { id, authorId: me.id };

  const existing = await prisma.announcement.findFirst({
    where,
    select: {
      id: true,
      title: true,
      kosId: true,
      audienceCount: true,
      authorId: true,
    },
  });
  if (!existing) {
    return {
      error:
        "Pengumuman tidak ditemukan atau Anda tidak punya izin untuk menghapusnya.",
    };
  }

  await prisma.announcement.delete({ where: { id: existing.id } });

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "ANNOUNCEMENT.DELETE",
    entityType: "Announcement",
    entityId: existing.id,
    metadata: {
      title: existing.title,
      kosId: existing.kosId,
      audienceCount: existing.audienceCount,
      originalAuthorId: existing.authorId,
    },
  });

  revalidatePath("/announcements");
  return { success: "Pengumuman berhasil dihapus." };
}
