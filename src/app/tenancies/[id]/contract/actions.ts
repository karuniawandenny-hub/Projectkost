"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, getEffectiveOwnerId } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export type SignState = { error?: string; success?: boolean };

const MAX_SIGNATURE_BYTES = 100 * 1024; // 100 KB

/**
 * Simpan tandatangan elektronik di Tenancy. Tandatangan datang dari
 * <canvas>.toDataURL("image/png") di klien.
 *
 * Penghuni bisa tandatangan sebagai PIHAK KEDUA, pemilik kos sebagai
 * PIHAK PERTAMA. Tidak ada yang bisa menandatangani atas nama orang
 * lain — owner tidak boleh tandatangan untuk tenant, dst.
 *
 * Idempoten: re-sign mengganti tandatangan + timestamp lama. Audit log
 * mencatat setiap aksi.
 */
export async function signContract(
  _prev: SignState,
  formData: FormData
): Promise<SignState> {
  const me = await requireUser();

  const tenancyId = String(formData.get("tenancyId") ?? "").trim();
  const dataUrl = String(formData.get("signature") ?? "");
  if (!tenancyId) return { error: "Tenancy tidak ditemukan." };

  // Validasi data URL PNG. Format: "data:image/png;base64,xxxx"
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    return {
      error: "Format tandatangan tidak valid. Coba goreskan ulang lalu simpan.",
    };
  }
  if (dataUrl.length > MAX_SIGNATURE_BYTES * 1.4) {
    return {
      error:
        "Tandatangan terlalu besar. Hapus dan tandatangan ulang dengan goresan lebih singkat.",
    };
  }
  // Batas longgar: minimal beberapa byte (canvas kosong ~ 60 byte)
  if (m[1].length < 200) {
    return {
      error:
        "Tandatangan terlihat kosong. Goreskan tanda tangan Anda di kotak lebih dulu.",
    };
  }

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      tenant: { select: { id: true, name: true } },
      room: {
        include: {
          kos: { select: { ownerId: true, name: true } },
        },
      },
    },
  });
  if (!tenancy) return { error: "Tenancy tidak ditemukan." };

  const isTenant = tenancy.tenant.id === me.id;
  // CATATAN LEGAL: tandatangan owner hanya boleh dilakukan oleh pemilik
  // ASLI kos. MANAGER (anggota tim yang di-invite owner) DILARANG
  // tandatangan atas nama owner walaupun secara operasional mereka
  // punya akses manage kos ini. Karena itu kita cek `me.id === ownerId`
  // langsung, BUKAN pakai getEffectiveOwnerId.
  const isOwner = tenancy.room.kos.ownerId === me.id;
  if (!isTenant && !isOwner) {
    // Pesan spesifik untuk MANAGER supaya jelas kenapa ditolak.
    if (me.role === "MANAGER") {
      return {
        error:
          "Sebagai anggota tim, Anda tidak dapat menandatangani kontrak atas nama pemilik. Tandatangan pihak pertama harus dilakukan oleh pemilik kos sendiri.",
      };
    }
    return { error: "Anda tidak berwenang menandatangani kontrak ini." };
  }

  const now = new Date();
  if (isTenant) {
    await prisma.tenancy.update({
      where: { id: tenancy.id },
      data: { tenantSignatureUrl: dataUrl, tenantSignedAt: now },
    });
  } else {
    await prisma.tenancy.update({
      where: { id: tenancy.id },
      data: { ownerSignatureUrl: dataUrl, ownerSignedAt: now },
    });
  }

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "TENANCY.CREATE", // re-use; sub-aksi di metadata
    entityType: "Tenancy",
    entityId: tenancy.id,
    metadata: {
      subAction: "SIGN",
      role: isTenant ? "TENANT" : "OWNER",
      kosName: tenancy.room.kos.name,
    },
  });

  revalidatePath(`/tenancies/${tenancy.id}/contract`);
  return { success: true };
}
