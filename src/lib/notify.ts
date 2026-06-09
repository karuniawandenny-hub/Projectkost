import { prisma } from "./prisma";
import { sendPushToUser } from "./push";
import { categorize, getUserPrefs, shouldSend } from "./notif-prefs";

/**
 * Buat notifikasi in-app + (best-effort) kirim Web Push ke device user.
 *
 * - In-app SELALU dibuat (jadi catatan abadi di /notifications, juga
 *   sumber data untuk badge "belum dibaca").
 * - Push hormati `notifPrefs` user: kategori bisa dimatikan,
 *   jam tenang (default 22-06) akan menahan kiriman push tanpa
 *   menghilangkan in-app.
 *
 * Push tidak boleh menggagalkan pembuatan notifikasi: kalau push error
 * atau VAPID belum diset, in-app tetap tersimpan.
 */
export async function notify(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const created = await prisma.notification.create({ data: params });

  try {
    const prefs = await getUserPrefs(params.userId);
    const category = categorize(params.type);
    if (shouldSend(prefs, category, "push")) {
      await sendPushToUser(params.userId, {
        title: params.title,
        body: params.message,
        url: params.link ?? "/notifications",
        tag: params.type,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[notify][push]", e);
  }

  return created;
}
