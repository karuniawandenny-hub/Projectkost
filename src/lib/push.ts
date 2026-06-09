/**
 * Web Push (PWA) — kirim notifikasi ke HP penghuni meski app tidak
 * dibuka. Mengurangi ketergantungan pada kuota WA Fonnte.
 *
 * Konfigurasi (env):
 *  - NEXT_PUBLIC_VAPID_PUBLIC_KEY : kunci publik VAPID (boleh di client)
 *  - VAPID_PRIVATE_KEY            : kunci privat VAPID (server saja)
 *  - VAPID_SUBJECT               : "mailto:admin@kosbaiti.com" (opsional)
 *
 * Generate sepasang kunci sekali:
 *   npx web-push generate-vapid-keys
 * lalu set kedua env di Railway. Tanpa kunci, push otomatis no-op
 * (in-app + email tetap jalan) — aman untuk dev.
 */
import webpush from "web-push";
import { prisma } from "./prisma";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@kosbaiti.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

export type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Simpan/refresh langganan push milik user (idempoten per endpoint). */
export async function saveSubscription(
  userId: string,
  sub: SubscriptionInput,
  userAgent?: string
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 255),
    },
    update: {
      // Re-assign ke user terbaru + refresh kunci kalau browser rotate.
      userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription
    .delete({ where: { endpoint } })
    .catch(() => undefined); // sudah tidak ada — abaikan
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Kirim push ke SEMUA device milik user. Best-effort: subscription mati
 * (HTTP 404/410) otomatis dihapus supaya tabel tidak menumpuk sampah.
 * Tidak melempar error — caller (notify, broadcast) tidak boleh gagal
 * karena push.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!ensureConfigured()) return; // VAPID belum diset → no-op
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data
        );
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          // Endpoint sudah expired/unsubscribed — bersihkan.
          await removeSubscription(s.endpoint);
        } else {
          // eslint-disable-next-line no-console
          console.error("[push][send-fail]", status ?? e);
        }
      }
    })
  );
}
