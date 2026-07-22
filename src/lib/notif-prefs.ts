import { prisma } from "./prisma";

/**
 * Kategori notifikasi — DI-SPLIT per role.
 *
 * Sebelumnya 4 kategori shared (PAYMENT/ANNOUNCEMENT/OPERATIONAL/ACCOUNT)
 * yang labelnya harus di-adaptasi per role. Sekarang kategori tegas
 * per role:
 *   - TENANT_*: kategori event yang penghuni terima.
 *   - OWNER_*:  kategori event yang pemilik terima.
 *
 * Manfaat:
 *   - UI form hanya tampilkan kategori yang relevan (tenant tidak
 *     lihat toggle "Komplain baru dari penghuni" yang mereka tidak
 *     pernah terima).
 *   - Semantik jelas, tidak ambigu.
 *   - Toggle lebih granular (contoh: penghuni bisa matikan reminder
 *     tagihan tapi tetap terima notif akun disetujui).
 *
 * Migrasi: notifPrefs JSON lama dengan key PAYMENT/ANNOUNCEMENT/
 * OPERATIONAL/ACCOUNT tetap dibaca via parsePrefs() dengan fallback
 * mapping — user tidak kehilangan preferensi. Default kategori baru:
 * semua true (opt-out model).
 */
export const NotifCategory = {
  // ----- TENANT-side -----
  TENANT_PAYMENT: "TENANT_PAYMENT",
  TENANT_ANNOUNCEMENT: "TENANT_ANNOUNCEMENT",
  TENANT_COMPLAINT: "TENANT_COMPLAINT",
  TENANT_MAINTENANCE: "TENANT_MAINTENANCE",
  TENANT_MOVE: "TENANT_MOVE",
  TENANT_ACCOUNT: "TENANT_ACCOUNT",

  // ----- OWNER-side -----
  OWNER_TENANT_PENDING: "OWNER_TENANT_PENDING",
  OWNER_PAYMENT: "OWNER_PAYMENT",
  OWNER_COMPLAINT: "OWNER_COMPLAINT",
  OWNER_MOVE: "OWNER_MOVE",
  OWNER_MAINTENANCE: "OWNER_MAINTENANCE",
} as const;
export type NotifCategory =
  (typeof NotifCategory)[keyof typeof NotifCategory];

export type NotifRole = "TENANT" | "OWNER";

/** Kategori yang relevan untuk role tertentu — dipakai oleh UI form. */
export const CATEGORIES_BY_ROLE: Record<NotifRole, NotifCategory[]> = {
  TENANT: [
    NotifCategory.TENANT_PAYMENT,
    NotifCategory.TENANT_ANNOUNCEMENT,
    NotifCategory.TENANT_COMPLAINT,
    NotifCategory.TENANT_MAINTENANCE,
    NotifCategory.TENANT_MOVE,
    NotifCategory.TENANT_ACCOUNT,
  ],
  OWNER: [
    NotifCategory.OWNER_TENANT_PENDING,
    NotifCategory.OWNER_PAYMENT,
    NotifCategory.OWNER_COMPLAINT,
    NotifCategory.OWNER_MOVE,
    NotifCategory.OWNER_MAINTENANCE,
  ],
};

export const NOTIF_CATEGORY_LABEL: Record<NotifCategory, string> = {
  // TENANT
  TENANT_PAYMENT: "Pembayaran & tagihan",
  TENANT_ANNOUNCEMENT: "Pengumuman kos",
  TENANT_COMPLAINT: "Update komplain Anda",
  TENANT_MAINTENANCE: "Perawatan kamar & kos",
  TENANT_MOVE: "Pindah kamar",
  TENANT_ACCOUNT: "Akun & penempatan",
  // OWNER
  OWNER_TENANT_PENDING: "Pengajuan penghuni baru",
  OWNER_PAYMENT: "Pembayaran masuk dari penghuni",
  OWNER_COMPLAINT: "Komplain baru",
  OWNER_MOVE: "Permintaan pindah kamar",
  OWNER_MAINTENANCE: "Jadwal perawatan",
};

export const NOTIF_CATEGORY_HINT: Record<NotifCategory, string> = {
  // TENANT
  TENANT_PAYMENT:
    "Reminder H-3, hasil verifikasi (lunas/ditolak), dan konfirmasi upload bukti.",
  TENANT_ANNOUNCEMENT:
    "Pemberitahuan dari pemilik (mati air, kerja bakti, aturan baru, dsb).",
  TENANT_COMPLAINT: "Balasan pemilik atas komplain yang Anda kirim.",
  TENANT_MAINTENANCE:
    "Jadwal perawatan kamar Anda dan fasilitas kos, mulai/selesai perawatan.",
  TENANT_MOVE:
    "Hasil pengajuan pindah kamar Anda (disetujui/ditolak).",
  TENANT_ACCOUNT:
    "Akun disetujui/ditolak dan perubahan penempatan kamar (mis. tanggal mulai sewa).",
  // OWNER
  OWNER_TENANT_PENDING:
    "Ada calon penghuni baru mendaftar & menunggu persetujuan Anda.",
  OWNER_PAYMENT:
    "Penghuni upload bukti bayar — waktunya Anda verifikasi.",
  OWNER_COMPLAINT: "Komplain baru dari penghuni yang perlu ditindak lanjuti.",
  OWNER_MOVE: "Penghuni mengajukan pindah kamar.",
  OWNER_MAINTENANCE:
    "Pengingat H-7/H-3/H-1 untuk jadwal perawatan yang Anda catat.",
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

const ALL_CATEGORIES = Object.values(NotifCategory) as NotifCategory[];

function allOn(): Record<NotifCategory, boolean> {
  return ALL_CATEGORIES.reduce(
    (acc, k) => {
      acc[k] = true;
      return acc;
    },
    {} as Record<NotifCategory, boolean>
  );
}

export function defaultPrefs(): NotifPrefs {
  return {
    push: allOn(),
    email: allOn(),
    wa: allOn(),
    quietHours: { enabled: true, startHour: 22, endHour: 6 },
  };
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/**
 * Legacy mapping — kategori shared lama (PAYMENT/ANNOUNCEMENT/
 * OPERATIONAL/ACCOUNT) ke kategori baru. Kalau JSON prefs pengguna
 * masih pakai key lama, kita fan-out ke semua kategori baru yang
 * setara. Kategori yang tidak relevan role user tetap disimpan tapi
 * tidak akan pernah di-check di runtime — harmless.
 */
const LEGACY_KEY_TO_NEW: Record<string, NotifCategory[]> = {
  PAYMENT: [NotifCategory.TENANT_PAYMENT, NotifCategory.OWNER_PAYMENT],
  ANNOUNCEMENT: [NotifCategory.TENANT_ANNOUNCEMENT],
  OPERATIONAL: [
    NotifCategory.TENANT_COMPLAINT,
    NotifCategory.TENANT_MAINTENANCE,
    NotifCategory.TENANT_MOVE,
    NotifCategory.OWNER_COMPLAINT,
    NotifCategory.OWNER_MOVE,
    NotifCategory.OWNER_MAINTENANCE,
  ],
  ACCOUNT: [
    NotifCategory.TENANT_ACCOUNT,
    NotifCategory.OWNER_TENANT_PENDING,
  ],
};

function sanitizeChannel(
  raw: unknown,
  fallback: Record<NotifCategory, boolean>
): Record<NotifCategory, boolean> {
  const out = { ...fallback };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    // Key baru — dibaca langsung.
    for (const k of ALL_CATEGORIES) {
      if (isBool(r[k])) out[k] = r[k] as boolean;
    }
    // Key legacy — fan-out. Kalau BOTH legacy dan baru ada, key baru
    // menang (di-set duluan di atas).
    for (const [legacyKey, newCats] of Object.entries(LEGACY_KEY_TO_NEW)) {
      if (isBool(r[legacyKey])) {
        const v = r[legacyKey] as boolean;
        for (const nc of newCats) {
          // Hanya set kalau key baru belum ada di JSON — hindari
          // menimpa preferensi eksplisit.
          if (!isBool(r[nc])) out[nc] = v;
        }
      }
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
 * Kategorisasi `type` notifikasi → kategori user-facing baru.
 * Fungsi ini menentukan channel/quiet-hours mana yang berlaku
 * saat notif dikirim.
 */
export function categorize(type: string): NotifCategory {
  // ----- TENANT-side events -----
  if (
    type === "PAYMENT_VERIFIED" ||
    type === "PAYMENT_AUTO_VERIFIED" ||
    type === "PAYMENT_REJECTED" ||
    type === "PAYMENT_SUBMITTED_SELF" ||
    type.startsWith("REMINDER_")
  ) {
    return NotifCategory.TENANT_PAYMENT;
  }
  if (type === "ANNOUNCEMENT") return NotifCategory.TENANT_ANNOUNCEMENT;
  if (type === "COMPLAINT_UPDATE") return NotifCategory.TENANT_COMPLAINT;
  if (type.startsWith("MAINT_TENANT_")) {
    return NotifCategory.TENANT_MAINTENANCE;
  }
  if (type === "MOVE_APPROVED" || type === "MOVE_REJECTED") {
    return NotifCategory.TENANT_MOVE;
  }
  if (
    type === "TENANT_APPROVED_ASSIGNED" ||
    type === "TENANT_REJECTED" ||
    type === "TENANCY_ASSIGNED" ||
    type === "TENANCY_START_UPDATED"
  ) {
    return NotifCategory.TENANT_ACCOUNT;
  }

  // ----- OWNER-side events -----
  if (type === "PAYMENT_SUBMITTED") return NotifCategory.OWNER_PAYMENT;
  if (type === "COMPLAINT_NEW") return NotifCategory.OWNER_COMPLAINT;
  if (type === "MOVE_REQUEST") return NotifCategory.OWNER_MOVE;
  if (type === "TENANT_PENDING") return NotifCategory.OWNER_TENANT_PENDING;
  if (type.startsWith("MAINT_")) return NotifCategory.OWNER_MAINTENANCE;

  // Fallback: operasional-tenant (paling konservatif — item tidak dikenal
  // biasanya adalah update operasional yang penghuni butuh tahu).
  return NotifCategory.TENANT_ACCOUNT;
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
