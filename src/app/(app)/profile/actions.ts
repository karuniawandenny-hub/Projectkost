"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { deleteUploadByUrl } from "@/lib/upload";
import { logAudit } from "@/lib/audit";
import {
  CATEGORIES_BY_ROLE,
  parsePrefs,
  type Channel,
  type NotifRole,
} from "@/lib/notif-prefs";

export type UpdatePhoneState = {
  error?: string;
  success?: boolean;
};

/**
 * User update nomor HP sendiri. Wajib format Indonesia valid.
 * Dipakai dari banner di dashboard dan halaman /profile.
 */
export async function updateOwnPhone(
  _prev: UpdatePhoneState,
  formData: FormData
): Promise<UpdatePhoneState> {
  const me = await requireUser();
  const raw = String(formData.get("phone") ?? "").trim();
  if (!raw) return { error: "Nomor HP wajib diisi." };

  const phone = normalizePhone(raw);
  if (!phone) {
    return { error: "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx." };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { phone },
  });

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { success: true };
}

export type UpdatePrefsState = { error?: string; success?: boolean };

const CHANNELS: Channel[] = ["push", "email", "wa"];

/**
 * User menyimpan preferensi notifikasi sendiri. Format checkbox HTML:
 * field hadir dengan value "on" kalau dicentang, absen kalau tidak.
 *
 * Iterasi HANYA kategori yang relevan untuk role user — kategori lain
 * (mis. OWNER_* saat user tenant) tetap di-preserve dari prefs eksisting
 * supaya tidak tertimpa false secara diam-diam. Ini penting untuk
 * hardening kalau ada user yang bertukar role di masa depan.
 */
export async function updateNotifPrefs(
  _prev: UpdatePrefsState,
  formData: FormData
): Promise<UpdatePrefsState> {
  const me = await requireUser();
  const role: NotifRole = canManageKos(me) ? "OWNER" : "TENANT";
  const relevantCategories = CATEGORIES_BY_ROLE[role];

  // Mulai dari prefs eksisting (setelah legacy migration di parsePrefs).
  // Ini preserve kategori yang tidak di-render di form user ini.
  const prefs = parsePrefs(me.notifPrefs ?? null);
  for (const ch of CHANNELS) {
    for (const cat of relevantCategories) {
      prefs[ch][cat] = formData.get(`${ch}.${cat}`) === "on";
    }
  }
  prefs.quietHours.enabled = formData.get("quietHours.enabled") === "on";

  const startRaw = parseInt(
    String(formData.get("quietHours.startHour") ?? ""),
    10
  );
  const endRaw = parseInt(
    String(formData.get("quietHours.endHour") ?? ""),
    10
  );
  if (Number.isInteger(startRaw) && startRaw >= 0 && startRaw <= 23) {
    prefs.quietHours.startHour = startRaw;
  }
  if (Number.isInteger(endRaw) && endRaw >= 0 && endRaw <= 23) {
    prefs.quietHours.endHour = endRaw;
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { notifPrefs: JSON.stringify(prefs) },
  });
  revalidatePath("/profile");
  return { success: true };
}

export async function getMyNotifPrefs() {
  const me = await requireUser();
  const u = await prisma.user.findUnique({
    where: { id: me.id },
    select: { notifPrefs: true },
  });
  return parsePrefs(u?.notifPrefs ?? null);
}

export type SetDefaultSignatureState = {
  error?: string;
  success?: string;
};

const MAX_SIG_BYTES = 100 * 1024; // 100 KB

const UPLOAD_ROOT =
  process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.length > 0
    ? process.env.UPLOADS_DIR
    : path.join(process.cwd(), "public", "uploads");

/**
 * Owner (atau ADMIN) set gambar TTD default. Sumber bisa dari:
 *  1. Data URL PNG (hasil canvas signature pad di /profile), atau
 *  2. Upload file PNG langsung.
 *
 * Disimpan sebagai file di uploads (bukan inline data URL) supaya
 * ukuran DB tetap kecil & cache/CDN bisa optimize. File lama otomatis
 * dihapus setiap ganti.
 */
export async function setDefaultSignature(
  _prev: SetDefaultSignatureState,
  formData: FormData
): Promise<SetDefaultSignatureState> {
  const me = await requireUser();
  // TTD default = tandatangan pribadi. Hanya OWNER asli & ADMIN. MANAGER
  // (anggota tim) tidak boleh set TTD karena tidak berwenang tandatangan
  // kontrak sewa atas nama pemilik.
  if (me.role !== "OWNER" && me.role !== "ADMIN") {
    return {
      error:
        "Sebagai anggota tim, Anda tidak bisa mengatur tandatangan default — fitur ini khusus untuk pemilik kos.",
    };
  }

  const dataUrl = String(formData.get("signature") ?? "");
  const file = formData.get("file");

  let bytes: Buffer;
  if (dataUrl) {
    const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return { error: "Format tandatangan tidak valid." };
    if (dataUrl.length > MAX_SIG_BYTES * 1.4) {
      return { error: "Tandatangan terlalu besar. Coba gores lebih singkat." };
    }
    if (m[1].length < 200) {
      return {
        error:
          "Tandatangan terlihat kosong. Goreskan tanda tangan di kotak dulu.",
      };
    }
    bytes = Buffer.from(m[1], "base64");
  } else if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SIG_BYTES) {
      return { error: "File terlalu besar (maks 100 KB)." };
    }
    if (file.type !== "image/png") {
      return { error: "File harus PNG." };
    }
    bytes = Buffer.from(await file.arrayBuffer());
  } else {
    return { error: "Belum ada tandatangan yang dikirim." };
  }

  // Simpan ke uploads
  const subdir = `users/${me.id}/signature`;
  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });
  const filename = `default-${Date.now()}-${randomBytes(4).toString("hex")}.png`;
  await writeFile(path.join(dir, filename), bytes);
  const url = `/uploads/${subdir}/${filename}`;

  // Ambil existing untuk dihapus.
  const existing = await prisma.user.findUnique({
    where: { id: me.id },
    select: { defaultSignatureUrl: true },
  });

  await prisma.user.update({
    where: { id: me.id },
    data: { defaultSignatureUrl: url },
  });

  if (existing?.defaultSignatureUrl) {
    await deleteUploadByUrl(existing.defaultSignatureUrl);
  }

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.APPROVE",
    entityType: "User",
    entityId: me.id,
    metadata: { subAction: "SET_DEFAULT_SIGNATURE" },
  });

  revalidatePath("/profile");
  return { success: "Tandatangan default tersimpan." };
}

/**
 * Hapus TTD default. Setelah dihapus, canvas kontrak baru akan
 * kembali kosong (owner harus tandatangan manual). Silent no-op
 * kalau memang belum ada default — form UI hanya render tombol ini
 * ketika default sudah aktif, jadi race-condition harmless.
 */
export async function clearDefaultSignature(): Promise<void> {
  const me = await requireUser();
  // Batasi ke OWNER asli & ADMIN — sama seperti setDefaultSignature,
  // MANAGER tidak punya wewenang tandatangan jadi tidak perlu akses.
  if (me.role !== "OWNER" && me.role !== "ADMIN") return;

  const existing = await prisma.user.findUnique({
    where: { id: me.id },
    select: { defaultSignatureUrl: true },
  });
  if (!existing?.defaultSignatureUrl) return;

  await prisma.user.update({
    where: { id: me.id },
    data: { defaultSignatureUrl: null },
  });
  await deleteUploadByUrl(existing.defaultSignatureUrl);

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.APPROVE",
    entityType: "User",
    entityId: me.id,
    metadata: { subAction: "CLEAR_DEFAULT_SIGNATURE" },
  });

  revalidatePath("/profile");
}
