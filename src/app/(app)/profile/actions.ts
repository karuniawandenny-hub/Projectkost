"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import {
  defaultPrefs,
  NotifCategory,
  parsePrefs,
  type Channel,
  type NotifCategory as NotifCategoryT,
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
const CATEGORIES = Object.keys(NotifCategory) as NotifCategoryT[];

/**
 * User menyimpan preferensi notifikasi sendiri. Format checkbox HTML:
 * field hadir dengan value "on" kalau dicentang, absen kalau tidak.
 * Mulai dari struktur default (semua on), set false untuk yang absen.
 */
export async function updateNotifPrefs(
  _prev: UpdatePrefsState,
  formData: FormData
): Promise<UpdatePrefsState> {
  const me = await requireUser();

  const prefs = defaultPrefs();
  for (const ch of CHANNELS) {
    for (const cat of CATEGORIES) {
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
