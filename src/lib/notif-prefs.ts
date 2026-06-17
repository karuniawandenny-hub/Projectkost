import { prisma } from "./prisma";

/**
 * Kategori notifikasi (sisi user). Mapping dari `type` di notify() &
 * reminders.ts → kategori ditangani oleh categorize().
 */
export const NotifCategory = {
  PAYMENT: "PAYMENT", // tagihan, reminder H3 & overdue, verifikasi, ditolak
  ANNOUNCEMENT: "ANNOUNCEMENT", // broadcast pemilik
  OPERATIONAL: "OPERATIONAL", // komplain, perawatan, pindah kamar
  ACCOUNT: "ACCOUNT", // perubahan status akun, assignment
} as const;
export type NotifCategory =
  (typeof NotifCategory)[keyof typeof NotifCategory];

export const NOTIF_CATEGORY_LABEL: Record<NotifCategory, string> = {
  PAYMENT: "Pembayaran & reminder",
  ANNOUNCEMENT: "Pengumuman pemilik",
  OPERATIONAL: "Komplain, perawatan, pindah kamar",
  ACCOUNT: "Status akun & penempatan",
};

export const NOTIF_CATEGORY_HINT: Record<NotifCategory, string> = {
  PAYMENT:
    "Tagihan jatuh tempo H-7/H-3/H-1, konfirmasi pembayaran lunas, ditolak.",
  ANNOUNCEMENT: "Pemberitahuan dari pemilik (mati air, kerja bakti, dsb).",
  OPERATIONAL:
    "Status komplain, jadwal perawatan kamar, hasil pengajuan pindah.",
  ACCOUNT: "Akun disetujui, ditolak, dan perubahan penempatan kamar.",
};

export type Channel = "push" | "email" | "wa";

export type NotifPrefs = {
  push: Record<NotifCategory, boolean>;
  email: Record<NotifCategory, boolean>;
  wa: Record<NotifCategory, boolean>;
  quietHours: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23, boleh < start (artinya wrap tengah malam)
  };
};

export function defaultPrefs(): NotifPrefs {
  const allOn: Record<NotifCategory, boolean> = {
    PAYMENT: true,
    ANNOUNCEMENT: true,
    OPERATIONAL: true,
    ACCOUNT: true,
  };
  return {
    push: { ...allOn },
    email: { ...allOn },
    wa: { ...allOn },
    quietHours: { enabled: true, startHour: 22, endHour: 6 },
  };
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function sanitizeChannel(
  raw: unknown,
  fallback: Record<NotifCategory, boolean>
): Record<NotifCategory, boolean> {
  const out = { ...fallback };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const k of Object.keys(NotifCategory) as NotifCategory[]) {
      if (isBool(r[k])) out[k] = r[k] as boolean;
    }
  }
  return out;
}

export function parsePrefs(raw: string | null | undefined): NotifPrefs {
  const def = defaultPrefs();
  if (!raw) return def;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      push: sanitizeChannel(obj.push, def.push),
      email: sanitizeChannel(obj.email, def.email),
      wa: sanitizeChannel(obj.wa, def.wa),
      quietHours: {
        enabled:
          obj.quietHours && typeof obj.quietHours === "object"
            ? isBool((obj.quietHours as Record<string, unknown>).enabled)
              ? ((obj.quietHours as Record<string, unknown>).enabled as boolean)
              : def.quietHours.enabled
            : def.quietHours.enabled,
        startHour: clampHour(
          obj.quietHours && typeof obj.quietHours === "object"
            ? (obj.quietHours as Record<string, unknown>).startHour
            : null,
          def.quietHours.startHour
        ),
        endHour: clampHour(
          obj.quietHours && typeof obj.quietHours === "object"
            ? (obj.quietHours as Record<string, unknown>).endHour
            : null,
          def.quietHours.endHour
        ),
      },
    };
  } catch {
    return def;
  }
}

function clampHour(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  const n = Math.floor(v);
  if (n < 0 || n > 23) return fallback;
  return n;
}

/**
 * Kategorisasi `type` notifikasi → kategori user-facing. Default
 * OPERATIONAL kalau tidak dikenali (paling konservatif: kemungkinan
 * besar dia event operasional yang penghuni butuh tahu).
 */
export function categorize(type: string): NotifCategory {
  if (type.startsWith("PAYMENT_") || type.startsWith("REMINDER_")) {
    return NotifCategory.PAYMENT;
  }
  if (type === "ANNOUNCEMENT") return NotifCategory.ANNOUNCEMENT;
  if (
    type.startsWith("COMPLAINT_") ||
    type.startsWith("MAINT_") ||
    type.startsWith("MOVE_")
  ) {
    return NotifCategory.OPERATIONAL;
  }
  if (type.startsWith("TENANT_") || type.startsWith("TENANCY_")) {
    return NotifCategory.ACCOUNT;
  }
  return NotifCategory.OPERATIONAL;
}

/**
 * Apakah jam sekarang masuk jam tenang user? Mendukung wrap tengah
 * malam (start=22, end=6 berarti 22:00-23:59 + 00:00-05:59).
 */
export function isQuietHourNow(prefs: NotifPrefs, now = new Date()): boolean {
  if (!prefs.quietHours.enabled) return false;
  const h = now.getHours();
  const { startHour, endHour } = prefs.quietHours;
  if (startHour === endHour) return false; // 24h tidak boleh
  if (startHour < endHour) {
    return h >= startHour && h < endHour;
  }
  // wrap (mis. 22 → 6)
  return h >= startHour || h < endHour;
}

/**
 * Apakah channel diizinkan untuk kategori ini bagi user tertentu?
 * Otomatis hormati jam tenang. In-app tidak ikut hitungan — selalu
 * dibuat (jadi log abadi di /notifications).
 */
export function shouldSend(
  prefs: NotifPrefs,
  category: NotifCategory,
  channel: Channel,
  now = new Date()
): boolean {
  if (!prefs[channel][category]) return false;
  if (isQuietHourNow(prefs, now)) return false;
  return true;
}

/**
 * Ambil prefs user. Cache satu-level via prisma; cukup di-await sekali
 * per request — caller bertanggung jawab menghindari N+1.
 */
export async function getUserPrefs(userId: string): Promise<NotifPrefs> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { notifPrefs: true },
  });
  return parsePrefs(u?.notifPrefs ?? null);
}

export async function saveUserPrefs(
  userId: string,
  prefs: NotifPrefs
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { notifPrefs: JSON.stringify(prefs) },
  });
}
