/**
 * Toggle/konfigurasi runtime yang admin bisa ubah dari /admin/system
 * tanpa redeploy. Beda dengan env var: nilai disimpan di tabel
 * AppSetting (key-value) dan bisa diubah lewat UI hidup-hidup.
 *
 * Pakai cache memory pendek (30 detik) supaya helper bisa dipanggil
 * dari hot path (mis. setiap kirim notif) tanpa hit DB tiap kali —
 * trade-off: perubahan toggle butuh max 30 detik untuk efektif di
 * instance ini. Setelah setSetting() cache untuk key tsb di-clear
 * supaya admin lihat efek langsung di session-nya sendiri.
 */
import { prisma } from "./prisma";

type Entry = { value: string; expiresAt: number };
const CACHE = new Map<string, Entry>();
const TTL_MS = 30_000;

export const SETTING_KEYS = {
  /** "true" / "false" — apakah kirim WA saat notifyAffectedTenant() */
  MAINTENANCE_WA_ENABLED: "maintenance_wa_enabled",
} as const;

export async function getSetting(
  key: string,
  defaultValue: string
): Promise<string> {
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const row = await prisma.appSetting.findUnique({ where: { key } });
  const value = row?.value ?? defaultValue;
  CACHE.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export async function getSettingBool(
  key: string,
  defaultValue: boolean
): Promise<boolean> {
  const v = await getSetting(key, defaultValue ? "true" : "false");
  return v === "true";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  CACHE.delete(key);
}
