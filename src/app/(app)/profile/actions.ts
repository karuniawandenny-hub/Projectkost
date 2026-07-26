"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
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
